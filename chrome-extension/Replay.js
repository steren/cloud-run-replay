chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  main(request);
});

function mainStatus(status) {
  console.log(status);
  document.getElementById('status').textContent = status;
}

function log(message, severity) {
  console.log(message);
  if(severity !== 'DEBUG') {
    const li = document.createElement('li');
    li.textContent = message;
    document.getElementById('log').appendChild(li);
  }
}

function error(message) {
  console.error(message);
  const li = document.createElement('li');
  li.textContent = message;
  li.style.color = 'red';
  document.getElementById('log').appendChild(li);
}

function createLink(project, region, name) {
  const link = document.createElement('a');
  link.href = `https://console.cloud.google.com/run/jobs/details/${region}/${name}/executions?project=${project}`;
  link.target = '_blank';
  link.textContent = 'Open in Cloud Console';
  document.getElementById('link').appendChild(link);
}

function getFormData() {
  return Object.fromEntries(new FormData(document.querySelector('form')));
}

function getHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

function checkStatusForAuth(status) {
  if (status?.error?.code === 401 && status?.error?.status === 'UNAUTHENTICATED') {
    throw new Error(`Authentication error. Refresh the access token.`);
  }
}

async function enableAPIs(token, project) {
  log(`Making sure Cloud Storage and Cloud Run APIs are enabled...`);
  const apis = [
    'run.googleapis.com',
    'storage.googleapis.com',
  ];
  for(const api of apis) {
    const response = await fetch(`https://serviceusage.googleapis.com/v1/projects/${project}/services/${api}:enable`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    const status = await response.json();
    checkStatusForAuth(status);
  }
  log(`Enabled`, 'DEBUG'); 
}

async function upload(token, project, name, recording) {
  log(`Uploading replay...`);
  const bucketName = `${project}.appspot.com`;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
  const filename = `chrome-recodrings/${name}/recording-${name}-${timestamp}.json`;
  const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=${filename}`, {
    method: 'POST',
    body: JSON.stringify(recording),
    headers: getHeaders(token),
  });
  const status = await response.json();

  checkStatusForAuth(status);

  log(`Uploaded`, 'DEBUG');
  return `gs://${bucketName}/${filename}`;
}

function getJobPayload(image, gcsUrl) {
  return {
    labels: {
      'created-by': 'cloud-run-replay',
    },
    launchStage: 'BETA',
    client: 'chrome-devtools-extension',
    template: {
      taskCount: 1,
      template: {
        containers: [
          {
            image,
            args: [
              gcsUrl
            ],
          }
        ],
      },
    },
  };
}

/**
 * Query the status of a Job and wait for its state to be Success or Failure.
 */
async function checkJobReady(token, project, region, name) {
  log(`Waiting for job to be ready to execute...`, 'DEBUG');
  let jobState;
  while (jobState !== 'CONDITION_SUCCEEDED' && jobState !== 'CONDITION_FAILED') {
    const response = await fetch(`https://${region}-run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${name}`, {
      method: 'GET',
      headers: getHeaders(token),
    });
    const job = await response.json();
    jobState = job?.terminalCondition?.state;
    log('Not ready yet, waiting...', 'DEBUG');
    await new Promise(resolve => setTimeout(resolve, 1000));
  };
  log(`Job is ready to execute`, 'DEBUG');
}

async function create(token, project, region, name, image, gcsUrl) {
  log(`Creating job ${name} in region ${region}...`, 'DEBUG');

  return fetch(`https://${region}-run.googleapis.com/v2/projects/${project}/locations/${region}/jobs?jobId=${name}`, {
    method: 'POST',
    body: JSON.stringify(getJobPayload(image, gcsUrl)),
    headers: getHeaders(token),
  });
}

async function update(token, project, region, name, image, gcsUrl) {
  log(`Updating Cloud Run job ${name} in region ${region}...`, 'DEBUG');

  const response = await fetch(`https://${region}-run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${name}`, {
    method: 'PATCH',
    body: JSON.stringify(getJobPayload(image, gcsUrl)),
    headers: getHeaders(token),
  });
  const status = await response.json();
  if (status?.error) {
    error(`Error updating job: ${status.error.message}`);
    return false;
  }
} 

async function createOrUpdate(token, project, region, name, image, gcsUrl) {
  log(`Creating or updating job ${name} in region ${region}...`);

  const response = await create(token, project, region, name, image, gcsUrl);
  const status = await response.json();

  createLink(project, region, name);

  checkStatusForAuth(status);

  // If error with 409 code and ALREADY_EXISTS status, then update the job instead.
  if (status?.error?.code === 409 && status?.error?.status === 'ALREADY_EXISTS') {
    log('Job already exists, updating instead.', 'DEBUG');
    await update(token, project, region, name, image, gcsUrl);
  } else if (status?.error) {
    throw new Error(`Error creating job: ${status.error.message}`)
  }

  await checkJobReady(token, project, region, name);
}

async function execute(token, project, region, name) {
  log(`Executing...`);

  const response = await fetch(`https://${region}-run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${name}:run`, {
    method: 'POST',
    headers: getHeaders(token),
  });
  
  const status = await response.json();
  checkStatusForAuth(status);

  if (status?.error) {
    throw new Error(`Error executing job: ${status.error.message}`);
  }

  log(`Job executed (Open Cloud Console to see results)`);
}

function recordingTitleToJobName(title) {
  return title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}


function loadFormDataFromLocalStorage(recording) {
  const localToken = localStorage.getItem('token');
  const localProject = localStorage.getItem('project');
  const localRegion = localStorage.getItem('region');
  const localRecordingProject = localStorage.getItem(`${recording.title} - project`);
  const localRecordingName = localStorage.getItem(`${recording.title} - name`);
  const localRecordingRegion = localStorage.getItem(`${recording.title} - region`);
  if(localToken) {
    document.querySelector('#token').value = localToken;
  }
  if(localRecordingProject || localProject) {
    document.querySelector('#project').value = localRecordingProject || localProject;
  }
  document.querySelector('#name').value = localRecordingName || recordingTitleToJobName(recording.title);
  if(localRecordingRegion || localRegion) {
    document.querySelector('#region').value = localRecordingRegion || localRegion;
  }
}

async function doTheCloudThing(token, recording, params) {
  mainStatus(`Deploying recording ${recording.title} to Cloud Run job ${params.name} in region ${params.region} and project ${params.project}:`);

  try {
    await enableAPIs(token, params.project);
    const gcsUrl = await upload(token, params.project, params.name, recording);
    await createOrUpdate(token, params.project, params.region, params.name, params.image, gcsUrl);    
    await execute(token, params.project, params.region, params.name);
  
  } catch (e) {
    error(e.message);
  }
}

async function main(recordingData) {
  const recording = JSON.parse(recordingData);
  if(!recording) {
    error('No recording passed');
    return;
  }

  loadFormDataFromLocalStorage(recording);

  document.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();

    const params = getFormData();

    // store params in a global local storage
    localStorage.setItem('token', params.token);
    localStorage.setItem('project', params.project);
    localStorage.setItem('region', params.region);
    // store params for this specific recording
    localStorage.setItem(`${recording.title} - project`, params.project);
    localStorage.setItem(`${recording.title} - name`, params.name);
    localStorage.setItem(`${recording.title} - region`, params.region);


    if(!params.token) {
      log('Granting access...');
      chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
        if(token) {
          log(`Got OAuth token from Chrome`, 'DEBUG');
          doTheCloudThing(token, recording, params);
        } else {
          error('Could not get OAuth token from Chrome, try opening "Advanced Settings" and follow instructions to paste an access token.');
        }
      });
    } else {
      log(`Got OAuth token from Advanced Settings`, 'DEBUG');
      doTheCloudThing(params.token, recording, params);
    }
  };
}

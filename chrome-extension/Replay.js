// URL of the pre-built replayer container.
// TODO: update with a Google-managed container.
const replayerImageURL = 'steren/chrome-replayer';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  main(request);
});

function log(message) {
  console.log(message);
  const li = document.createElement('li');
  li.textContent = message;
  document.getElementById('log').appendChild(li);
}

function error(message) {
  console.error(message);
  const li = document.createElement('li');
  li.textContent = message;
  li.style.color = 'red';
  document.getElementById('log').appendChild(li);
}

function getFormData() {
  return Object.fromEntries(new FormData(document.querySelector('form')));
}

async function upload(token, project, recording) {
  log(`Uploading to Google Cloud Storage...`);
  const bucketName = `${project}.appspot.com`;
  const filename = 'recording.json';
  const response = await fetch(`https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=media&name=${filename}`, {
    method: 'POST',
    body: JSON.stringify(recording),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  log(`Uploaded`);
  return `gs://${bucketName}/${filename}`;
}


async function create(token, project, region, name, gcsUrl) {
  log(`Creating Cloud Run job ${name} in region ${region}...`);

  // TODO: check if job already exists
  const endpoint = `https://${region}-run.googleapis.com`;
  const job = {
    labels: {
      'created-by': 'cloud-run-replay',
    },
    launchStage: 'BETA',
    template: {
      taskCount: 1,
      template: {
        containers: [
          {
            image: replayerImageURL,
            args: [
              gcsUrl
            ],
          }
        ],
      },
    },
  };
  await fetch(`${endpoint}/v2/projects/${project}/locations/${region}/jobs?jobId=${name}`, {
    method: 'POST',
    body: JSON.stringify(job),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  // TODO: check response status

  // Query every 1s until job is ready
  let jobState;
  while(jobState !== 'CONDITION_SUCCEEDED' && jobState !== 'CONDITION_FAILED') {
    const response = await fetch(`${endpoint}/v2/projects/${project}/locations/${region}/jobs/${name}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const job = await response.json();
    jobState = job?.terminalCondition?.state;
    log(`Waiting for job to be ready to execute...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  log(`Job is ready to execute`);
}

async function execute(token, project, region, name) {
  log(`Executing Cloud Run job ${name} in region ${region}...`);
  const endpoint = `https://${region}-run.googleapis.com`;

  const response = await fetch(`${endpoint}/v2/projects/${project}/locations/${region}/jobs/${name}:run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });

  // TODO: check response status

  log(`Job executed`);
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

    log(`Deploying recording ${recording.title} to Cloud Run job ${params.name} in region ${params.region} and project ${params.project}`);

    const gcsUrl = await upload(params.token, params.project, recording);
    await create(params.token, params.project, params.region, params.name, gcsUrl);
    await execute(params.token, params.project, params.region, params.name);
  };
}

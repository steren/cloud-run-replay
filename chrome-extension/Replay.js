// URL of the pre-built replayer container.
// TODO: update with a Google-managed container.
const replayerImageURL = 'steren/chrome-replayer';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  localStorage.setItem('recording', request);
  main();
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

async function main() {
  document.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();

    const recording = JSON.parse(localStorage.getItem('recording'));

    if(!recording) {
      error('No recording passed');
      return;
    }

    const params = getFormData();
    log(`Deploying recording ${recording.title} to Cloud Run job ${params.name} in region ${params.region} and project ${params.project}`);

    const gcsUrl = await upload(params.token, params.project, recording);
    await create(params.token, params.project, params.region, params.name, gcsUrl);
    await execute(params.token, params.project, params.region, params.name);
  };
}

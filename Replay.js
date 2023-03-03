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
}

async function build(token, project) {
  log(`Building into container image...`);
  log(`Built`);
}

async function create(token, project, region, name) {
  log(`Creating Cloud Run job ${name} in region ${region}...`);
  log(`Created`);
}

async function execute(token, project, region, name) {
  log(`Executing Cloud Run job ${name} in region ${region}...`);
  log(`Executed`);
}

async function main() {
  document.querySelector('form').onsubmit = (event) => {
    event.preventDefault();

    const recording = JSON.parse(localStorage.getItem('recording'));

    if(!recording) {
      error('No recording passed');
      return;
    }

    const params = getFormData();
    log(`Deploying recording ${recording.title} to Cloud Run job ${params.name} in region ${params.region} and project ${params.project}`);

    upload(params.token, params.project, recording);
    build(params.token, params.project);
    create(params.token, params.project, params.region, params.name);
    execute(params.token, params.project, params.region, params.name);
  };
}

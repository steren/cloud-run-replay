const containerName = 'chrome-recording-replayer';
console.log(`Starting ${containerName}`);

import puppeteer from 'puppeteer';
import { createRunner, parse, PuppeteerRunnerExtension } from '@puppeteer/replay';
import {Storage} from '@google-cloud/storage';

// Create an extension that prints at every step of the replay
class Extension extends PuppeteerRunnerExtension {
  async beforeEachStep(step, flow) {
    await super.beforeEachStep(step, flow);
    console.log('Step: ', `${step.type} ${step.url || ''}`);
  }

  async afterAllSteps(flow) {
    await super.afterAllSteps(flow);
    console.log('All steps done');
  }
}


// Get recording Cloud Storage URL 
let recordingGCSFile = process.argv[2] || process.env.RECORDING;
if (!recordingGCSFile) {
  console.error('No recording file specified via RECORDING env var or container argument');
  process.exit(1);
}

if(!recordingGCSFile.startsWith('gs://')) {
  console.error(`The provided recording doesnt start with gs://: ${recordingGCSFile}`);
  process.exit(1);
}

const recordingGCSFileNoPrefix = recordingGCSFile.slice(5);
const urlParts = recordingGCSFileNoPrefix.split('/');
const bucketName = urlParts[0];
const fileName = urlParts.slice(1).join('/');

// read file from Cloud Storage
const storage = new Storage();
const contents = await storage.bucket(bucketName).file(fileName).download();

//const recordingText = await fs.readFileSync(recordingGCSFile, 'utf8');
const recording = parse(JSON.parse(contents));


// Start a browser and new page, needed to initialize the extension.
// TODO: remove these lines if https://github.com/puppeteer/replay/issues/201 is fixed
const browser = await puppeteer.launch({
  headless: true,
});
const page = await browser.newPage();

console.log(`replaying recording ${recording.title}`);
const runner = await createRunner(recording, new Extension(browser, page, 7000));
const result = await runner.run();

if(result) {
  console.log(`Recording ${recording.title} replayed successfully`);
  process.exit();
} else {
  console.error(`Recording ${recording.title} replayed with errors`);
  process.exit(1);
}
# cloud-run-replay

A Chrome extension that adds a new Chrome DevTools' Recorder button to run the replay on Google Cloud Run.

This repository contains:

1. In the `chrome-extension` folder: the source code for the extension 
2. In the `replayer-container` folder: the source code of a container image that replays a provided recording


## Deploy your own extension

The OAuth flow requires you to set up the extension properly with:
* [A OAuth 2.0 Client ID](https://console.cloud.google.com/apis/credentials) of the type "Chrome App"
* to add the proper `client_id` in the `manifest.json` file	
* to update the `key` attribute in the `manifest.json` file with the `key` value of the local extension found in `C:\Users\<user>\AppData\Local\Google\Chrome SxS\User Data\Default\Extensions` on Windows. Follow instructions [here](https://developer.chrome.com/docs/apps/app_identity/)
* to [configure the OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent) with your test user's email address.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  localStorage.setItem('recording', request);
  main();
});

const initHTML = document.body.innerHTML;

async function main() {
  const recording = JSON.parse(localStorage.getItem('recording'));

}

chrome.action.onClicked.addListener(async tab => {
  const url = chrome.runtime.getURL('dashboard.html');
  const existing = (await chrome.tabs.query({})).find(t => t.url?.startsWith(url));
  if (existing) return chrome.tabs.update(existing.id, {active: true});
  await chrome.tabs.create({url: `${url}?source=${tab.id}`});
});

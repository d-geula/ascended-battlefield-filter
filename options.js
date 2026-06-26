const SETTINGS_KEY = "ascBattlefieldFilterSettings";

const defaultSettings = {
  deImageify: true,
};

const checkbox = document.getElementById("deImageify");
const status = document.getElementById("status");

const showStatus = (message) => {
  status.textContent = message;
  window.clearTimeout(showStatus.timeout);
  showStatus.timeout = window.setTimeout(() => {
    status.textContent = "";
  }, 1400);
};

chrome.storage.local.get(SETTINGS_KEY, (result) => {
  const settings = {
    ...defaultSettings,
    ...(result[SETTINGS_KEY] || {}),
  };
  checkbox.checked = settings.deImageify;
});

checkbox.addEventListener("change", () => {
  chrome.storage.local.set(
    {
      [SETTINGS_KEY]: {
        deImageify: checkbox.checked,
      },
    },
    () => showStatus("Saved")
  );
});

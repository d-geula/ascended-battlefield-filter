(async function () {
  const HEADER_SIGNATURE = [
    "Name",
    "Realm",
    "Rank",
    "Physical Presence",
    "Race",
    "Resources",
  ];

  const STORAGE_KEY = "ascBattlefieldFilterState";
  const SETTINGS_KEY = "ascBattlefieldFilterSettings";

  const defaultState = {
    hideNoInteraction: false,
    resourcesMin: "",
  };

  const defaultSettings = {
    deImageify: true,
  };

  const loadState = () => {
    try {
      return {
        ...defaultState,
        ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
      };
    } catch (error) {
      return { ...defaultState };
    }
  };

  const state = loadState();

  const loadSettings = () =>
    new Promise((resolve) => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        resolve({ ...defaultSettings });
        return;
      }

      chrome.storage.local.get(SETTINGS_KEY, (result) => {
        resolve({
          ...defaultSettings,
          ...(result[SETTINGS_KEY] || {}),
        });
      });
    });

  const settings = await loadSettings();

  const saveState = () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        hideNoInteraction: state.hideNoInteraction,
        resourcesMin: state.resourcesMin,
      })
    );
  };

  const normalize = (value) =>
    String(value || "")
      .replace(/[\u00ad\u200b-\u200f]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const parseNumber = (value) => {
    const cleaned = normalize(value).replace(/,/g, "");
    if (!cleaned || cleaned.includes("?")) return null;
    const match = cleaned.match(/\d+/);
    return match ? Number(match[0]) : null;
  };

  const decodeBase64Url = (value) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    let output = "";
    let buffer = 0;
    let bits = 0;

    for (const char of normalized) {
      const index = chars.indexOf(char);
      if (index === -1) continue;
      buffer = (buffer << 6) | index;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }

    return output;
  };

  const parseImageNumber = (cell) => {
    const image = cell?.querySelector("img.numimg[src*='im.php?t=']");
    if (!image) return null;

    try {
      const url = new URL(image.getAttribute("src"), location.href);
      const token = url.searchParams.get("t");
      if (!token) return null;

      const payload = JSON.parse(decodeBase64Url(token));
      return payload.v && /^\d+$/.test(String(payload.v)) ? Number(payload.v) : null;
    } catch (error) {
      return null;
    }
  };

  const parseCellNumber = (cell) => parseNumber(getCellText(cell)) ?? parseImageNumber(cell);

  const getCellText = (cell) => normalize(cell ? cell.textContent : "");

  const findBattlefieldTable = () =>
    [...document.querySelectorAll("table")].find((table) => {
      const headers = [...table.querySelectorAll("tr:first-child th")].map(getCellText);
      return HEADER_SIGNATURE.every((header, index) => headers[index] === header);
    });

  const getForms = (nameCell) =>
    [...nameCell.querySelectorAll("form")].map((form) => {
      const inputs = [...form.querySelectorAll("input")].map((input) => ({
        type: input.type,
        name: input.name,
        value: input.value,
        title: input.title || input.alt || "",
        visible: input.type !== "hidden" && getComputedStyle(input).visibility !== "hidden",
      }));

      return {
        action: form.getAttribute("action") || "",
        method: form.getAttribute("method") || "get",
        missionType:
          inputs.find((input) => input.name === "mission_type")?.value ||
          inputs.find((input) => input.name === "missiontype")?.value ||
          "",
        inputs,
      };
    });

  const hasVisibleQuickAction = (nameCell) =>
    [...nameCell.querySelectorAll("input[type=image], button")].some((control) => {
      const style = getComputedStyle(control);
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        control.offsetWidth > 0 &&
        control.offsetHeight > 0
      );
    });

  const getNameMeta = (nameCell) => {
    const link = nameCell.querySelector('a[href*="stats.php?id="]');
    const clone = nameCell.cloneNode(true);
    clone.querySelectorAll("a, form, input, button, img").forEach((node) => node.remove());
    const tagText = normalize(clone.textContent);
    const href = link ? link.getAttribute("href") || "" : "";

    return {
      name: normalize(link ? link.textContent : nameCell.textContent),
      id: href.match(/id=(\d+)/)?.[1] || "",
      href,
      tagText,
      tooLargeToEngage: getCellText(nameCell).includes("Too Large To Engage"),
      forms: getForms(nameCell),
    };
  };

  const parseRow = (row, index) => {
    const cells = [...row.cells];
    const nameMeta = getNameMeta(cells[0]);
    const presenceText = getCellText(cells[3]);
    const resourceText = getCellText(cells[5]);
    const physicalPresence = parseCellNumber(cells[3]);
    const resources = parseCellNumber(cells[5]);

    return {
      index,
      element: row,
      name: nameMeta.name,
      playerId: nameMeta.id,
      playerHref: nameMeta.href,
      tagText: nameMeta.tagText,
      hasInteraction: hasVisibleQuickAction(cells[0]),
      tooLargeToEngage: nameMeta.tooLargeToEngage,
      realm: getCellText(cells[1]),
      rank: parseCellNumber(cells[2]),
      rankText: getCellText(cells[2]),
      physicalPresence,
      physicalPresenceKnown: physicalPresence !== null && !presenceText.includes("?"),
      physicalPresenceText: presenceText,
      race: getCellText(cells[4]),
      resources,
      resourcesKnown: resources !== null && !resourceText.includes("?"),
      resourcesText: resourceText,
      actions: nameMeta.forms,
      cells: cells.map(getCellText),
    };
  };

  const getRows = (table) =>
    [...table.querySelectorAll("tr")]
      .slice(1)
      .filter((row) => row.cells.length >= HEADER_SIGNATURE.length)
      .map(parseRow);

  const numberPasses = (value, min, max) => {
    if (min !== "" && (value === null || value < Number(min))) return false;
    if (max !== "" && (value === null || value > Number(max))) return false;
    return true;
  };

  const rowPasses = (row) => {
    if (state.hideNoInteraction && !row.hasInteraction) return false;
    if (!numberPasses(row.resources, state.resourcesMin, "")) return false;
    return true;
  };

  const createField = (labelText, key, attrs = {}) => {
    const label = document.createElement("label");
    label.className = "abf-field";
    label.textContent = labelText;

    const input = document.createElement("input");
    Object.assign(input, attrs);
    input.value = state[key];
    if (input.type === "checkbox") input.checked = Boolean(state[key]);
    input.addEventListener("input", () => {
      state[key] = input.type === "checkbox" ? input.checked : input.value;
      saveState();
      applyFilters();
    });

    label.append(input);
    return label;
  };

  let rows = [];
  let countNode;

  const applyFilters = () => {
    let shown = 0;
    rows.forEach((row) => {
      const visible = rowPasses(row);
      row.element.style.display = visible ? "" : "none";
      if (visible) shown += 1;
    });
    if (countNode) countNode.textContent = `${shown}/${rows.length} rows shown`;
  };

  const injectStyles = () => {
    const style = document.createElement("style");
    style.textContent = `
      #abf-panel {
        margin: 12px 0 16px;
        padding: 12px 14px;
        border: 1px solid #777;
        background: #111;
        color: #ddd;
        font: 12px Arial, sans-serif;
      }
      #abf-panel, #abf-panel * { box-sizing: border-box; }
      #abf-panel .abf-grid {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 18px;
        max-width: none;
      }
      #abf-panel .abf-field {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 6px;
      }
      #abf-panel input, #abf-panel select, #abf-panel button {
        min-height: 22px;
        border: 1px solid #666;
        background: #222;
        color: #eee;
      }
      #abf-panel .abf-check {
        gap: 6px;
        padding-bottom: 0;
      }
      #abf-panel .abf-check input {
        min-height: auto;
      }
      #abf-panel .abf-actions {
        display: flex;
        align-items: end;
        gap: 8px;
      }
      #abf-panel button {
        padding: 2px 8px;
        cursor: pointer;
      }
      #abf-panel input[type="number"] {
        width: 150px;
      }
      #abf-count {
        align-self: center;
        white-space: nowrap;
      }
      .abf-deimageified-number {
        color: #ddd;
        font: inherit;
        vertical-align: middle;
        user-select: text;
      }
    `;
    document.head.append(style);
  };

  const findSpylogIdImage = () =>
    [...document.querySelectorAll("img.numimg[src*='im.php?t=']")].find((image) =>
      getCellText(image.closest("td")).includes("Main Realm Identification Number:")
    );

  const deImageifySpylog = () => {
    const image = findSpylogIdImage();
    const id = parseImageNumber(image?.closest("td"));
    if (!image || id === null) return false;

    const text = document.createElement("span");
    text.className = "abf-deimageified-number";
    text.textContent = String(id);
    image.replaceWith(text);
    return true;
  };

  const buildPanel = (table) => {
    const panel = document.createElement("div");
    panel.id = "abf-panel";

    const grid = document.createElement("div");
    grid.className = "abf-grid";

    const hideNoInteraction = createField("Show attackable only", "hideNoInteraction", {
      type: "checkbox",
    });
    hideNoInteraction.classList.add("abf-check");

    grid.append(
      hideNoInteraction,
      createField("Min DMU", "resourcesMin", {
        type: "number",
        min: "0",
        placeholder: "1500000000000000",
      })
    );

    const actions = document.createElement("div");
    actions.className = "abf-actions";
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "Reset";
    reset.addEventListener("click", () => {
      Object.keys(state).forEach((key) => {
        state[key] = typeof state[key] === "boolean" ? false : "";
      });
      saveState();
      panel.remove();
      buildPanel(table);
      applyFilters();
    });
    countNode = document.createElement("span");
    countNode.id = "abf-count";
    actions.append(reset, countNode);

    grid.append(actions);
    panel.append(grid);
    table.parentNode.insertBefore(panel, table);
  };

  injectStyles();

  if (location.pathname.endsWith("/spylog.php")) {
    if (settings.deImageify) deImageifySpylog();
    return;
  }

  const table = findBattlefieldTable();
  if (!table || document.getElementById("abf-panel")) return;

  rows = getRows(table);
  window.ascBattlefieldFilter = {
    get rows() {
      return rows.map(({ element, ...row }) => row);
    },
    parseRow,
    table,
    applyFilters,
    state,
  };

  buildPanel(table);
  applyFilters();
})();

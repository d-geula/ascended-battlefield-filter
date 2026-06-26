# Ascended Battlefield Filter

Tiny unpacked Chrome extension for filtering the GateWars Ascended cosmos battlefield table and smoothing out the spylog page.

## Load it

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select this folder: `C:\Users\dgeul\Documents\ascended-battlefield-filter`.

The filter panel appears on `https://asc.gatewa.rs/battlefield.php*` and `https://asc.gatewa.rs/battlefieldE.php*`.

On `https://asc.gatewa.rs/spylog.php*`, the extension can replace the Main Realm Identification Number image with selectable text.

The extension options page includes **De-imageify numeric values**, a default-on setting for replacing supported image-rendered numbers with selectable text.

Current controls:

- **Show attackable only** hides rows without visible quick-action controls in the name cell.
- **Min DMU** hides rows whose Dark Matter Units are below the entered amount.

## Table Shape

The extension identifies the player table by this exact header row:

```text
Name | Realm | Rank | Physical Presence | Race | Resources
```

Each player row is parsed into:

```js
{
  name,
  playerId,
  playerHref,
  tagText,
  tooLargeToEngage,
  realm,
  rank,
  rankText,
  physicalPresence,
  physicalPresenceKnown,
  physicalPresenceText,
  race,
  resources,
  resourcesKnown,
  resourcesText,
  actions,
  cells
}
```

The first cell contains the player `stats.php?id=...` link, optional tag text, and up to four inline forms: `Recon`, `Attack1`, hidden `Attack`, and `God Quest`. The extension leaves those forms untouched and only toggles table row visibility.

Known resource values are rendered as `img.numimg` images. The extension decodes the image URL token and reads its `v` value as the numeric Dark Matter Units amount.

The spylog Main Realm Identification Number uses the same image token shape. When de-imageify is enabled, the extension decodes that token locally and replaces the image with its `v` value, so no OCR service or external API is needed.

For manual console tests on the battlefield page:

```js
ascBattlefieldFilter.rows.slice(0, 3)
ascBattlefieldFilter.rows.filter((row) => row.hasInteraction)
ascBattlefieldFilter.rows.filter((row) => row.resourcesKnown && row.resources >= 1500000000000000)
```

// 静的DOMへの多言語メッセージ適用。popup.html / options.html からのみ読み込む
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-unit]").forEach((el) => {
    el.dataset.unit = t(el.dataset.i18nUnit);
  });
  document.documentElement.lang = getUiLocale();
});

// Shows whether Nullify's engine is running on this page (it marks <html> with data-nullify).
addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("status");
  const host = document.documentElement.dataset.nullify;
  el.className = `status ${host ? "on" : "off"}`;
  el.textContent = host ? "✓ Nullify is active on this page." : "Nullify is not active on this page. The traps below will work.";
});

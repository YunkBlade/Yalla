// Busca a planilha de concorrentes publicada no Google Sheets e devolve o .xlsx
// para o painel ler no navegador (evita bloqueio de CORS do Google).
const SHEET_ID = "1kVjeFlQ6z9mJeZrR8CExD8WGwMkB6C8e4GQPFrxOSMk";

module.exports = async (req, res) => {
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`, { redirect: "follow" });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok || !ct.includes("spreadsheetml")) {
      res.statusCode = r.ok ? 403 : 502;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        error: r.ok
          ? "A planilha não está pública. No Google Sheets: Compartilhar → Qualquer pessoa com o link → Leitor."
          : "Google Sheets não respondeu (" + r.status + ")."
      }));
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
    res.end(buf);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Falha ao buscar a planilha: " + e.message }));
  }
};

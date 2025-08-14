import type { NextRequest } from "next/server";

type Finding = {
  key: string;
  ok: boolean;
  message: string;
  advice?: string;
};

type ScanResponse = {
  host: string;
  httpsEnabled: boolean;
  httpRedirectsToHttps: boolean;
  headers: {
    hsts: string | null;
    csp: string | null;
    xFrameOptions: string | null;
    xContentTypeOptions: string | null;
    referrerPolicy: string | null;
    permissionsPolicy: string | null;
  };
  score: number;
  findings: Finding[];
  priorities: { key: string; advice: string }[];
};

function normalizeUrl(input: string) {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  const u = new URL(url);
  return { httpsUrl: `https://${u.host}/`, httpUrl: `http://${u.host}/`, host: u.host };
}

function toBoolHeader(h: string | null | undefined) {
  return !!(h && h.length > 0);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { url?: string };
    const url = body.url;
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Falta 'url' en el body." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { httpsUrl, httpUrl, host } = normalizeUrl(url);

    // 1) Probar HTTPS
    let httpsEnabled = false;
    let httpsHeaders: Headers | null = null;
    try {
      const res = await fetch(httpsUrl, { redirect: "follow" });
      httpsEnabled = res.ok || (res.status >= 200 && res.status < 400);
      httpsHeaders = res.headers;
    } catch {
      httpsEnabled = false;
    }

    // 2) Probar si HTTP redirige a HTTPS
    let httpRedirectsToHttps = false;
    try {
      const res = await fetch(httpUrl, { redirect: "manual" });
      const loc = res.headers.get("location") || "";
      httpRedirectsToHttps =
        [301, 302, 307, 308].includes(res.status) && /^https:\/\//i.test(loc);
    } catch {
      httpRedirectsToHttps = false;
    }

    // 3) Leer cabeceras de seguridad de la respuesta HTTPS (si existe)
    const get = (name: string) => (httpsHeaders ? httpsHeaders.get(name) : null);
    const hsts = get("strict-transport-security");
    const csp = get("content-security-policy");
    const xfo = get("x-frame-options");
    const xcto = get("x-content-type-options");
    const refpol = get("referrer-policy");
    const ppol = get("permissions-policy");

    // 4) Generar findings
    const findings: Finding[] = [
      {
        key: "httpsEnabled",
        ok: httpsEnabled,
        message: httpsEnabled ? "HTTPS activo" : "HTTPS no responde correctamente",
        advice: httpsEnabled ? undefined : "Instala un certificado TLS válido y sirve la tienda por HTTPS.",
      },
      {
        key: "httpRedirectsToHttps",
        ok: httpRedirectsToHttps,
        message: httpRedirectsToHttps ? "HTTP redirige a HTTPS" : "HTTP no redirige a HTTPS",
        advice: httpRedirectsToHttps ? undefined : "Configura redirección 301/308 de http:// a https://.",
      },
      {
        key: "hsts",
        ok: toBoolHeader(hsts),
        message: toBoolHeader(hsts) ? "HSTS presente" : "HSTS ausente",
        advice:
          toBoolHeader(hsts) ? undefined :
          "Añade Strict-Transport-Security: max-age=15552000; includeSubDomains; preload.",
      },
      {
        key: "csp",
        ok: toBoolHeader(csp),
        message: toBoolHeader(csp) ? "CSP presente" : "CSP ausente",
        advice:
          toBoolHeader(csp) ? undefined :
          "Empieza con: Content-Security-Policy: default-src 'self'; upgrade-insecure-requests;",
      },
      {
        key: "x-frame-options",
        ok: toBoolHeader(xfo),
        message: toBoolHeader(xfo) ? "X-Frame-Options presente" : "X-Frame-Options ausente",
        advice:
          toBoolHeader(xfo) ? undefined :
          "Usa X-Frame-Options: DENY (o SAMEORIGIN) para evitar clickjacking.",
      },
      {
        key: "x-content-type-options",
        ok: toBoolHeader(xcto),
        message: toBoolHeader(xcto) ? "X-Content-Type-Options presente" : "X-Content-Type-Options ausente",
        advice:
          toBoolHeader(xcto) ? undefined :
          "Usa X-Content-Type-Options: nosniff para bloquear MIME sniffing.",
      },
      {
        key: "referrer-policy",
        ok: toBoolHeader(refpol),
        message: toBoolHeader(refpol) ? "Referrer-Policy presente" : "Referrer-Policy ausente",
        advice:
          toBoolHeader(refpol) ? undefined :
          "Usa Referrer-Policy: strict-origin-when-cross-origin.",
      },
      {
        key: "permissions-policy",
        ok: toBoolHeader(ppol),
        message: toBoolHeader(ppol) ? "Permissions-Policy presente" : "Permissions-Policy ausente",
        advice:
          toBoolHeader(ppol) ? undefined :
          "Añade Permissions-Policy para limitar APIs (e.g. camera=(), geolocation=()).",
      },
    ];

    // 5) Score sencillo
    let score =
      findings.filter(f => f.ok && f.key !== "httpsEnabled" && f.key !== "httpRedirectsToHttps").length * 10;
    if (httpsEnabled) score += 10;
    if (httpRedirectsToHttps) score += 10;
    score = Math.max(0, Math.min(100, score));

    const priorities = findings
      .filter(f => !f.ok && f.advice)
      .slice(0, 3)
      .map(f => ({ key: f.key, advice: f.advice as string }));

    const payload: ScanResponse = {
      host,
      httpsEnabled,
      httpRedirectsToHttps,
      headers: {
        hsts,
        csp,
        xFrameOptions: xfo,
        xContentTypeOptions: xcto,
        referrerPolicy: refpol,
        permissionsPolicy: ppol,
      },
      score,
      findings,
      priorities,
    };

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Error inesperado";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
}

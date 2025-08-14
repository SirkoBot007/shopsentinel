"use client";

import { useState } from "react";

type Finding = {
  key: string;
  ok: boolean;
  message: string;
  advice?: string;
};

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleScan = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al escanear");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-100">
      <h1 className="text-3xl font-bold mb-4">ShopSentinel</h1>
      <p className="mb-6 text-gray-600">
        Escanea tu tienda online y revisa su configuración de seguridad básica.
      </p>

      <div className="flex space-x-2 mb-6 w-full max-w-md">
        <input
          type="text"
          placeholder="https://tu-tienda.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 border rounded px-3 py-2"
        />
        <button
          onClick={handleScan}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? "Escaneando..." : "Escanear"}
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}

      {result && (
        <div className="bg-white shadow p-4 rounded w-full max-w-2xl">
          <h2 className="text-xl font-semibold mb-2">
            Resultado: {result.host}
          </h2>
          <p className="mb-4">
            Score: <span className="font-bold">{result.score}/100</span>
          </p>
          <ul className="space-y-1 mb-4">
            {result.findings.map((f: Finding) => (
              <li
                key={f.key}
                className={f.ok ? "text-green-600" : "text-red-600"}
              >
                {f.ok ? "✅" : "❌"} {f.message}
              </li>
            ))}
          </ul>
          {result.priorities.length > 0 && (
            <div>
              <h3 className="font-semibold mb-1">Prioridades:</h3>
              <ol className="list-decimal list-inside">
                {result.priorities.map((p: any) => (
                  <li key={p.key}>{p.advice}</li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

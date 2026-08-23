'use client';
import { useEffect, useState } from 'react';
import { Plug, Plus, Loader2, Key } from 'lucide-react';
import { apiFetch } from '@/lib/api';

export function ConnectorsView() {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [service, setService] = useState('');
  const [keyVal, setKeyVal] = useState('');

  const load = async () => {
    try {
      const data = await apiFetch<any[]>('/api/connectors');
      setConnectors(Array.isArray(data) ? data : []);
    } catch {
      setConnectors([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) {
        try { await load(); } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const add = async () => {
    if (!name || !service || !keyVal) return;
    try {
      await apiFetch('/api/connectors', {
        method: 'POST',
        body: JSON.stringify({ name, service, keyValue: keyVal }),
      });
      setName('');
      setService('');
      setKeyVal('');
      setShow(false);
      await load();
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Connecteurs</h1>
          <p className="text-muted-foreground">Cles API et services externes</p>
        </div>
        <button
          onClick={() => setShow(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
        >
          <Plus className="h-4 w-4" /> Ajouter
        </button>
      </div>

      {show && (
        <div className="bg-card rounded-xl border p-4 space-y-3">
          <input
            placeholder="Nom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
          <input
            placeholder="Service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
          <input
            type="password"
            placeholder="Cle"
            value={keyVal}
            onChange={(e) => setKeyVal(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-background text-sm"
          />
          <div className="flex gap-2">
            <button
              onClick={add}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm"
            >
              Enregistrer
            </button>
            <button
              onClick={() => setShow(false)}
              className="px-4 py-2 border rounded-lg text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {connectors.length === 0 ? (
        <div className="text-center py-16">
          <Plug className="h-12 w-12 mx-auto mb-4" />
          <h3>Aucun connecteur</h3>
          <p className="text-sm text-muted-foreground mt-2">
            Ajoutez vos cles API pour connecter des services externes
          </p>
        </div>
      ) : (
        connectors.map((x: any) => (
          <div key={x.id} className="bg-card rounded-xl border p-4 flex items-center gap-4">
            <Key className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <h3>{x.name}</h3>
              <p className="text-xs text-muted-foreground">{x.service}</p>
            </div>
            <span
              className={`text-xs px-2 py-1 rounded-full ${
                x.isActive
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-muted'
              }`}
            >
              {x.isActive ? 'Actif' : 'Inactif'}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

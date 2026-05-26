'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuthStore } from '@/lib/store';

interface GuardrailCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  editGuardrail?: {
    id: string;
    name: string;
    type: string;
    description: string;
    severity: string;
    rules: string;
  } | null;
}

const guardrailTypes = [
  { value: 'content_check', label: 'Vérification contenu' },
  { value: 'risk_analysis', label: 'Analyse de risque' },
  { value: 'permission_gate', label: 'Porte de permission' },
  { value: 'logic_verify', label: 'Vérification logique' },
  { value: 'custom', label: 'Personnalisé' },
];

const severities = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Avertissement' },
  { value: 'critical', label: 'Critique' },
  { value: 'blocking', label: 'Bloquant' },
];

export function GuardrailCreateDialog({ open, onOpenChange, onSuccess, editGuardrail }: GuardrailCreateDialogProps) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const parseRules = (rulesStr: string) => {
    try {
      return JSON.parse(rulesStr || '{}');
    } catch {
      return {};
    }
  };

  const [form, setForm] = useState({
    name: editGuardrail?.name || '',
    type: editGuardrail?.type || '',
    description: editGuardrail?.description || '',
    severity: editGuardrail?.severity || 'warning',
    rulesText: editGuardrail ? JSON.stringify(parseRules(editGuardrail.rules), null, 2) : '{\n  \n}',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.type) {
      toast({ title: 'Erreur', description: 'Nom et type requis', variant: 'destructive' });
      return;
    }

    let rules;
    try {
      rules = JSON.parse(form.rulesText);
    } catch {
      toast({ title: 'Erreur', description: 'Règles JSON invalides', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const url = editGuardrail ? `/api/guardrails/${editGuardrail.id}` : '/api/guardrails';
      const method = editGuardrail ? 'PUT' : 'POST';
      const body = editGuardrail
        ? { name: form.name, type: form.type, description: form.description, severity: form.severity, rules }
        : { name: form.name, type: form.type, description: form.description, severity: form.severity, rules, userId: user?.id };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        toast({ title: 'Erreur', description: data.error, variant: 'destructive' });
        return;
      }

      toast({
        title: editGuardrail ? 'Garde-fou modifié' : 'Garde-fou créé',
        description: `${form.name} a été ${editGuardrail ? 'modifié' : 'créé'} avec succès`,
      });
      onOpenChange(false);
      onSuccess();
      setForm({ name: '', type: '', description: '', severity: 'warning', rulesText: '{\n  \n}' });
    } catch {
      toast({ title: 'Erreur', description: 'Erreur serveur', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editGuardrail ? 'Modifier le garde-fou' : 'Créer un garde-fou'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Nom</Label>
            <Input
              placeholder="Ex: Vérification contenu commercial"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={form.type} onValueChange={(value) => setForm({ ...form, type: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner un type" />
              </SelectTrigger>
              <SelectContent>
                {guardrailTypes.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Décrivez ce que ce garde-fou vérifie..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Sévérité</Label>
            <Select value={form.severity} onValueChange={(value) => setForm({ ...form, severity: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {severities.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Règles (JSON)</Label>
            <Textarea
              value={form.rulesText}
              onChange={(e) => setForm({ ...form, rulesText: e.target.value })}
              rows={5}
              className="font-mono text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editGuardrail ? 'Modifier' : 'Créer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

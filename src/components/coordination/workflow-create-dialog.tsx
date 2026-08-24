'use client';

import { useState } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StepDraft {
  title: string;
  description: string;
  agentType: string;
  priority: string;
}

interface WorkflowCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const AGENT_TYPES = [
  { value: 'sales', label: 'Commercial' },
  { value: 'support', label: 'Support' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'research', label: 'Recherche' },
  { value: 'rh', label: 'RH' },
  { value: 'accounting', label: 'Comptabilité' },
  { value: 'custom', label: 'Personnalisé' },
];

const PRIORITIES = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
];

const EMPTY_STEP: StepDraft = {
  title: '',
  description: '',
  agentType: 'custom',
  priority: 'medium',
};

export function WorkflowCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: WorkflowCreateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([{ ...EMPTY_STEP }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setDescription('');
    setSteps([{ ...EMPTY_STEP }]);
    setError(null);
  };

  const updateStep = (i: number, patch: Partial<StepDraft>) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const addStep = () => setSteps((prev) => [...prev, { ...EMPTY_STEP }]);

  const removeStep = (i: number) =>
    setSteps((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));

  const handleSubmit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Le nom du workflow est requis.');
      return;
    }

    const validSteps = steps
      .filter((s) => s.title.trim() !== '')
      .map((s) => ({
        title: s.title.trim(),
        description: s.description.trim(),
        agentType: s.agentType,
        priority: s.priority,
        status: 'pending',
      }));

    setSubmitting(true);
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          trigger: 'manual',
          steps: validSteps,
        }),
      });

      if (!res.ok) {
        let serverMsg = `Erreur ${res.status}`;
        try {
          const errBody = await res.json();
          if (errBody?.error) serverMsg = errBody.error;
        } catch { /* ignore */ }
        throw new Error(serverMsg);
      }

      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de la création');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!submitting) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau workflow</DialogTitle>
          <DialogDescription>
            Définissez le nom et les étapes de votre workflow multi-agents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Nom</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Veille concurrentielle"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez ce que ce workflow automatise…"
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Étapes</label>
              <Button type="button" variant="outline" size="sm" onClick={addStep}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Ajouter une étape
              </Button>
            </div>

            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground shrink-0">
                      Étape {i + 1}
                    </span>
                    <Input
                      value={step.title}
                      onChange={(e) => updateStep(i, { title: e.target.value })}
                      placeholder="Titre de l'étape (ex. Collecter les données)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeStep(i)}
                      disabled={steps.length === 1}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    value={step.description}
                    onChange={(e) => updateStep(i, { description: e.target.value })}
                    placeholder="Description de l'étape (optionnel)"
                    rows={2}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={step.agentType}
                      onValueChange={(v) => updateStep(i, { agentType: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Type d'agent" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENT_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={step.priority}
                      onValueChange={(v) => updateStep(i, { priority: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Priorité" />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-destructive/10 text-destructive text-sm px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => { onOpenChange(false); reset(); }}
            disabled={submitting}
          >
            Annuler
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Création…
              </>
            ) : (
              'Créer le workflow'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

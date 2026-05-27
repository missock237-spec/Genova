'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { GuardrailCard } from './guardrail-card';
import { GuardrailCreateDialog } from './guardrail-create-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Plus, Shield, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface Guardrail {
  id: string;
  name: string;
  type: string;
  description: string;
  severity: string;
  isActive: boolean;
  rules: string;
}

export function GuardrailsView() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editGuardrail, setEditGuardrail] = useState<Guardrail | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const loadGuardrails = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch('/api/guardrails', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setGuardrails(data);
      }
    } catch (error) {
      console.error('Failed to load guardrails:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadGuardrails();
  }, [loadGuardrails]);

  const handleToggle = async (id: string) => {
    try {
      const res = await fetch(`/api/guardrails/${id}/toggle`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const updated = await res.json();
        setGuardrails((prev) => prev.map((g) => (g.id === id ? { ...g, isActive: updated.isActive } : g)));
        toast({
          title: updated.isActive ? 'Garde-fou activé' : 'Garde-fou désactivé',
        });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors du changement de statut', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/guardrails/${deleteId}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        setGuardrails((prev) => prev.filter((g) => g.id !== deleteId));
        toast({ title: 'Garde-fou supprimé' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de la suppression', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  const handleEdit = (guardrail: Guardrail) => {
    setEditGuardrail(guardrail);
    setCreateOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Garde-fous & Validations
          </h2>
          <p className="text-sm text-muted-foreground">{guardrails.length} garde-fou(s) configuré(s)</p>
        </div>
        <Button className="gap-2" onClick={() => { setEditGuardrail(null); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" />
          Créer un garde-fou
        </Button>
      </div>

      {guardrails.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="Aucun garde-fou"
          description="Créez des garde-fous pour valider et sécuriser les actions de vos agents IA"
          actionLabel="Créer un garde-fou"
          onAction={() => { setEditGuardrail(null); setCreateOpen(true); }}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {guardrails.map((guardrail) => (
            <GuardrailCard
              key={guardrail.id}
              guardrail={guardrail}
              onToggle={handleToggle}
              onDelete={setDeleteId}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      <GuardrailCreateDialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setEditGuardrail(null);
        }}
        onSuccess={loadGuardrails}
        editGuardrail={editGuardrail}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce garde-fou ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Les validations associées seront également supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

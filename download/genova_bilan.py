#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genova AI Agent Operating System - Bilan Complet du SaaS
Généré via ReportLab
"""
import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm, cm
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, CondPageBreak, Image, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.platypus.tableofcontents import TableOfContents
import hashlib

# ── Fonts ──────────────────────────────────────────────────
pdfmetrics.registerFont(TTFont('WenQuanYi', '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('SarasaMonoSC-Bold', '/usr/share/fonts/truetype/chinese/SarasaMonoSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC', '/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', '/usr/share/fonts/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSerif', '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSerif-Bold', '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'))
pdfmetrics.registerFont(TTFont('LiberationSans', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))

registerFontFamily('NotoSerifSC', normal='NotoSerifSC', bold='NotoSerifSC-Bold')
registerFontFamily('WenQuanYi', normal='WenQuanYi', bold='WenQuanYi')
registerFontFamily('SarasaMonoSC', normal='SarasaMonoSC', bold='SarasaMonoSC-Bold')
registerFontFamily('LiberationSerif', normal='LiberationSerif', bold='LiberationSerif-Bold')
registerFontFamily('DejaVuSans', normal='DejaVuSans', bold='DejaVuSans')

# ── Palette ──────────────────────────────────────────────────
PAGE_BG       = colors.HexColor('#eff0f1')
SECTION_BG    = colors.HexColor('#e6e8e9')
CARD_BG       = colors.HexColor('#ebeded')
TABLE_STRIPE  = colors.HexColor('#f0f2f3')
HEADER_FILL   = colors.HexColor('#486a7b')
COVER_BLOCK   = colors.HexColor('#465d69')
BORDER        = colors.HexColor('#c1ced4')
ICON          = colors.HexColor('#3e7794')
ACCENT        = colors.HexColor('#c33149')
ACCENT_2      = colors.HexColor('#9c56ce')
TEXT_PRIMARY   = colors.HexColor('#1b1d1e')
TEXT_MUTED     = colors.HexColor('#6f7578')
SEM_SUCCESS   = colors.HexColor('#3f8c58')
SEM_WARNING   = colors.HexColor('#99804d')
SEM_ERROR     = colors.HexColor('#a55a53')
SEM_INFO      = colors.HexColor('#456687')

# ── Page Setup ──────────────────────────────────────────────
PAGE_W, PAGE_H = A4
LEFT_MARGIN = 1.0 * inch
RIGHT_MARGIN = 1.0 * inch
TOP_MARGIN = 0.8 * inch
BOTTOM_MARGIN = 0.8 * inch
AVAILABLE_W = PAGE_W - LEFT_MARGIN - RIGHT_MARGIN

# ── Styles ──────────────────────────────────────────────────
styles = getSampleStyleSheet()

s_cover_title = ParagraphStyle('CoverTitle', fontName='NotoSerifSC', fontSize=36, leading=48,
    alignment=TA_CENTER, textColor=TEXT_PRIMARY, spaceAfter=12)
s_cover_subtitle = ParagraphStyle('CoverSubtitle', fontName='NotoSerifSC', fontSize=16, leading=24,
    alignment=TA_CENTER, textColor=TEXT_MUTED, spaceAfter=8)
s_cover_meta = ParagraphStyle('CoverMeta', fontName='LiberationSerif', fontSize=11, leading=16,
    alignment=TA_CENTER, textColor=TEXT_MUTED)

s_h1 = ParagraphStyle('H1', fontName='NotoSerifSC', fontSize=20, leading=28,
    textColor=HEADER_FILL, spaceBefore=18, spaceAfter=10)
s_h2 = ParagraphStyle('H2', fontName='NotoSerifSC', fontSize=15, leading=22,
    textColor=ACCENT, spaceBefore=14, spaceAfter=8)
s_h3 = ParagraphStyle('H3', fontName='NotoSerifSC', fontSize=12, leading=18,
    textColor=SEM_INFO, spaceBefore=10, spaceAfter=6)

s_body = ParagraphStyle('Body', fontName='NotoSerifSC', fontSize=10.5, leading=18,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, wordWrap='CJK',
    spaceBefore=2, spaceAfter=6, firstLineIndent=21)
s_body_no_indent = ParagraphStyle('BodyNoIndent', fontName='NotoSerifSC', fontSize=10.5, leading=18,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, wordWrap='CJK',
    spaceBefore=2, spaceAfter=6)

s_callout = ParagraphStyle('Callout', fontName='NotoSerifSC', fontSize=11, leading=18,
    alignment=TA_LEFT, textColor=ACCENT, wordWrap='CJK',
    spaceBefore=6, spaceAfter=6, leftIndent=24,
    borderPadding=6, borderWidth=2, borderColor=ACCENT, borderRadius=0)

s_table_header = ParagraphStyle('TableHeader', fontName='NotoSerifSC', fontSize=9.5, leading=14,
    alignment=TA_CENTER, textColor=colors.white, wordWrap='CJK')
s_table_cell = ParagraphStyle('TableCell', fontName='NotoSerifSC', fontSize=9, leading=13,
    alignment=TA_CENTER, textColor=TEXT_PRIMARY, wordWrap='CJK')
s_table_cell_left = ParagraphStyle('TableCellL', fontName='NotoSerifSC', fontSize=9, leading=13,
    alignment=TA_LEFT, textColor=TEXT_PRIMARY, wordWrap='CJK')

s_toc_h1 = ParagraphStyle('TOCH1', fontName='NotoSerifSC', fontSize=13, leftIndent=20, leading=22)
s_toc_h2 = ParagraphStyle('TOCH2', fontName='NotoSerifSC', fontSize=11, leftIndent=40, leading=18)

# ── Helpers ──────────────────────────────────────────────────
def P(text, style=s_body):
    return Paragraph(text, style)

def H1(text):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), s_h1)
    p.bookmark_name = text
    p.bookmark_level = 0
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def H2(text):
    key = 'h_%s' % hashlib.md5(text.encode()).hexdigest()[:8]
    p = Paragraph('<a name="%s"/>%s' % (key, text), s_h2)
    p.bookmark_name = text
    p.bookmark_level = 1
    p.bookmark_text = text
    p.bookmark_key = key
    return p

def H3(text):
    return Paragraph(text, s_h3)

def make_table(headers, rows, col_ratios=None):
    n = len(headers)
    if col_ratios is None:
        col_ratios = [1.0/n] * n
    col_widths = [r * AVAILABLE_W for r in col_ratios]
    
    data = [[P('<b>%s</b>' % h, s_table_header) for h in headers]]
    for row in rows:
        data.append([P(str(c), s_table_cell_left if len(str(c))>20 else s_table_cell) for c in row])
    
    t = Table(data, colWidths=col_widths, hAlign='CENTER')
    style_cmds = [
        ('BACKGROUND', (0,0), (-1,0), HEADER_FILL),
        ('TEXTCOLOR', (0,0), (-1,0), colors.white),
        ('GRID', (0,0), (-1,-1), 0.5, BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 8),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]
    for i in range(1, len(data)):
        bg = colors.white if i % 2 == 1 else TABLE_STRIPE
        style_cmds.append(('BACKGROUND', (0,i), (-1,i), bg))
    t.setStyle(TableStyle(style_cmds))
    return t

# ── TOC DocTemplate ──────────────────────────────────────────
class TocDocTemplate(SimpleDocTemplate):
    def afterFlowable(self, flowable):
        if hasattr(flowable, 'bookmark_name'):
            level = getattr(flowable, 'bookmark_level', 0)
            text = getattr(flowable, 'bookmark_text', '')
            key = getattr(flowable, 'bookmark_key', '')
            self.notify('TOCEntry', (level, text, self.page, key))

# ── Build Document ──────────────────────────────────────────
OUTPUT = '/home/z/my-project/download/genova-bilan-saas.pdf'

doc = TocDocTemplate(OUTPUT, pagesize=A4,
    leftMargin=LEFT_MARGIN, rightMargin=RIGHT_MARGIN,
    topMargin=TOP_MARGIN, bottomMargin=BOTTOM_MARGIN)

story = []

# ═══════════════════════════════════════════════════════════
# PAGE DE COUVERTURE
# ═══════════════════════════════════════════════════════════
story.append(Spacer(1, 120))
story.append(P('<b>Genova AI Agent Operating System</b>', s_cover_title))
story.append(Spacer(1, 16))
story.append(HRFlowable(width="60%", thickness=2, color=ACCENT, spaceAfter=16, spaceBefore=0))
story.append(P('Bilan Complet du SaaS', s_cover_subtitle))
story.append(P('Fonctionnalites, Architecture et Comportement des Agents IA', s_cover_subtitle))
story.append(Spacer(1, 40))
story.append(P('Version 1.0  |  Mai 2026', s_cover_meta))
story.append(P('Next.js 16 + Prisma + PostgreSQL + TypeScript', s_cover_meta))
story.append(Spacer(1, 24))
story.append(HRFlowable(width="40%", thickness=1, color=BORDER, spaceAfter=16))
story.append(P('Document de reference technique', s_cover_meta))

story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# TABLE DES MATIERES
# ═══════════════════════════════════════════════════════════
story.append(P('<b>Table des Matieres</b>', s_h1))
story.append(Spacer(1, 12))
toc = TableOfContents()
toc.levelStyles = [s_toc_h1, s_toc_h2]
story.append(toc)
story.append(PageBreak())

# ═══════════════════════════════════════════════════════════
# 1. VUE D'ENSEMBLE DU SaaS
# ═══════════════════════════════════════════════════════════
story.append(H1('1. Vue d\'ensemble du SaaS Genova'))

story.append(P('Genova est un systeme d\'exploitation pour agents IA, concu comme une plateforme SaaS complete permettant de creer, gerer et orchestrer des agents intelligents autonomes. L\'architecture repose sur Next.js 16 (App Router), Prisma ORM avec PostgreSQL, TypeScript strict, Tailwind CSS 4, shadcn/ui, et Framer Motion pour les animations. Le systeme offre une interface utilisateur single-page application (SPA) avec navigation par vues geree via Zustand, offrant une experience fluide et reactive.'))

story.append(P('La plateforme se distingue par son architecture a plusieurs niveaux : un moteur d\'agents autonome avec boucle ReAct, un systeme de memoire a 3 niveaux (court terme, long terme, episodique), un routeur IA multi-fournisseurs avec basculement automatique, un pipeline de generation de medias (images et videos) avec chaines de secours, une integration WhatsApp avec Baileys et Cloud API, et un systeme de securite complet incluant RBAC, garde-fous, et journalisation d\'audit.'))

story.append(P('L\'infrastructure locale comprend PostgreSQL (port 5432) pour les 31 tables de la base de donnees, PocketBase (port 8090) pour le cache et les fichiers, n8n (port 5678) pour l\'automatisation des workflows, ComfyUI (port 8188) pour la generation d\'images locale, et une API video locale (port 8189) pour CogVideoX-2B et VideoCrafter2. Chaque service est gere par des scripts de demarrage et d\'arret centralises.'))

# Tableau des technologies
story.append(Spacer(1, 12))
story.append(make_table(
    ['Composant', 'Technologie', 'Port / Service'],
    [
        ['Frontend', 'Next.js 16 + React 19 + Tailwind CSS 4', 'Port 3000'],
        ['Base de donnees', 'PostgreSQL + Prisma ORM (31 modeles)', 'Port 5432'],
        ['Agents IA', 'ReAct Loop + StateGraph (LangGraph-style)', 'Interne'],
        ['Routeur IA', 'Groq (P1) > OpenRouter (P2) > z-ai-sdk', 'API REST'],
        ['Medias', 'ComfyUI + OpenRouter + Replicate + z-ai-sdk', 'Port 8188/8189'],
        ['WhatsApp', 'Baileys (P1) > Cloud API v21.0 (fallback)', 'Webhook'],
        ['Automatisation', 'n8n v2.22.5', 'Port 5678'],
        ['Cache/Fichiers', 'PocketBase', 'Port 8090'],
        ['Auth', 'PBKDF2 + httpOnly cookies + RBAC', 'Middleware'],
    ],
    [0.20, 0.50, 0.30]
))
story.append(Spacer(1, 6))
story.append(P('Tableau 1 : Stack technologique de Genova', ParagraphStyle('caption', fontName='NotoSerifSC', fontSize=8.5, alignment=TA_CENTER, textColor=TEXT_MUTED)))

# ═══════════════════════════════════════════════════════════
# 2. FONCTIONNALITES PRINCIPALES
# ═══════════════════════════════════════════════════════════
story.append(H1('2. Fonctionnalites principales'))

# 2.1 Authentification
story.append(H2('2.1 Authentification et Securite'))

story.append(P('Le systeme d\'authentification de Genova utilise PBKDF2 avec un sel unique par utilisateur (32 octets, 100 000 iterations, SHA-512, cles de 64 octets). Les mots de passe sont stockes au format "pbkdf2:iterations:salt:hash" ou le sel est integre directement dans la chaine de hachage, eliminant le besoin d\'un stockage separe. Le systeme supporte la migration automatique depuis 4 formats de hachage herites, effectuee de maniere transparente lors de chaque connexion reussie.'))

story.append(P('Les sessions sont gerees via des cookies httpOnly avec un token de session de 48 octets hexadecimaux. Chaque utilisateur peut avoir jusqu\'a 10 sessions simultanees, les plus anciennes etant automatiquement expulsees. La duree de vie d\'une session est de 24 heures, avec un token de rafraichissement valide 7 jours. Toutes les operations de session (creation, rafraichissement, expulsion, deconnexion) sont journalisees dans la table AuditLog pour conformite reglementaire.'))

story.append(P('Le controle d\'acces base sur les roles (RBAC) definit trois niveaux hierarchiques : utilisateur (niveau 0), administrateur (niveau 1), et super_administrateur (niveau 2). La fonction hasRole() effectue une verification hierarchique, permettant a un super_admin d\'acceder aux ressources admin. Les en-tetes de securite incluent X-Frame-Options DENY, X-Content-Type-Options nosniff, Content-Security-Policy, et Permissions-Policy. Le middleware d\'authentification protege toutes les routes /api/* avec une liste d\'exemption pour les routes publiques.'))

# 2.2 Agents IA
story.append(H2('2.2 Systeme d\'Agents IA Autonomes'))

story.append(P('Le coeur de Genova reside dans son systeme d\'agents IA autonomes, reposant sur deux modes d\'execution distincts mais complementaires : la boucle ReAct classique et le graphe d\'etat de style LangGraph. Ces deux modes partagent les memes types de contexte d\'execution (ExecutionContext), d\'etapes (ExecutionStep), et de plan d\'execution (ExecutionPlan), garantissant une coherence architecturale fondamentale.'))

story.append(H3('Boucle ReAct : Penser -> Agir -> Observer -> Reflechir -> Reessayer'))

story.append(P('La boucle ReAct constitue le mode d\'execution original et le plus eprouve. L\'agent suit un cycle rigoureux en cinq phases. Pendant la phase THINK, l\'agent raisonne sur la situation actuelle, analyse les options disponibles, et produit une decision structuree en JSON incluant sa pensee, l\'action choisie, les parametres d\'entree, un indicateur de finalite, et un score de confiance. Lors de la phase ACT, l\'outil selectionne est execute via le ToolRegistry avec un pipeline complet : verification des permissions, validation des capacites, application des politiques d\'execution, validation des parametres, execution en bac a sable, et analyse du resultat.'))

story.append(P('La phase OBSERVE capture le resultat de l\'action sous forme d\'etape d\'observation. Vient ensuite la phase REFLECT, veritable differentiateur de Genova : l\'agent evalue sa propre progression en calculant un score de progression (0-1), un score de qualite, une indication de necessite de reessai, et une recommandation parmi cinq options possibles (continuer, reessayer, adapter, arreter, repondre). Enfin, la phase RETRY permet l\'autocorrection : si la reflexion recommande un reessai, l\'agent analyse l\'erreur, propose une approche alternative, et tente une nouvelle execution corrigee.'))

story.append(P('Le systeme integre des mecanismes de securite robustes : limite maximale de 10 etapes par execution, arret automatique apres 3 erreurs consecutives, reflexion forcee a 70% du budget d\'etapes sans progression, verification des garde-fous pour les outils dangereux, et persistance de l\'etat d\'execution dans la table AgentExecution pour reprise ulterieure.'))

story.append(H3('Graphe d\'Etat : Mode LangGraph'))

story.append(P('Le deuxieme mode d\'execution implémente un graphe d\'etat de style LangGraph avec 11 phases distinctes : INIT, PLAN, THINK, ACT, OBSERVE, REFLECT, CORRECT, RETRY, RESPOND, ERROR, et COMPLETE. Chaque phase est un noeud du graphe avec un gestionnaire dedie, et les transitions entre noeuds peuvent etre conditionnelles.'))

story.append(P('Le systeme de detection de cycles limite les visites par noeud a 5 (10 pour THINK, REFLECT, OBSERVE) et le total d\'iterations a 50, prevenant les boucles infinies. La persistance d\'etat via StatePersistence permet de sauvegarder et reprendre l\'execution d\'un graphe a tout moment, avec restauration complete du detecteur de cycles. Le graphe peut etre exporte au format DOT de Graphviz pour visualisation.'))

# Tableau types d'agents
story.append(Spacer(1, 12))
story.append(make_table(
    ['Type d\'Agent', 'Outils Autorises', 'Cas d\'Usage'],
    [
        ['Ventes (sales)', 'web_search, database_query, calculator', 'Prospection, devis, suivi commercial'],
        ['Support (support)', 'database_query, web_search', 'Assistance client, resolution de problemes'],
        ['Marketing (marketing)', 'web_search, calculator, database_query', 'Campagnes, analyse de marche, contenu'],
        ['Recherche (research)', 'web_search, database_query, filesystem', 'Veille, analyses, rapports'],
        ['RH (rh)', 'database_query, calculator', 'Gestion du personnel, paie, conges'],
        ['Comptabilite (accounting)', 'calculator, database_query', 'Factures, bilans, declarations'],
        ['Personnalise (custom)', 'Tous les outils', 'Configuration libre par l\'utilisateur'],
    ],
    [0.22, 0.38, 0.40]
))
story.append(Spacer(1, 6))
story.append(P('Tableau 2 : Types d\'agents et leurs capacites', ParagraphStyle('caption2', fontName='NotoSerifSC', fontSize=8.5, alignment=TA_CENTER, textColor=TEXT_MUTED)))

# 2.3 Memoire
story.append(H2('2.3 Systeme de Memoire a 3 Niveaux'))

story.append(P('Le systeme de memoire de Genova opere sur trois niveaux distincts et complementaires, chacun avec un role specifique dans la capacite de l\'agent a apprendre et a s\'adapter au fil du temps.'))

story.append(P('La memoire a court terme gere le contexte de conversation avec une sensibilite au budget de tokens. Elle utilise un mecanisme de fenetre glissante qui conserve les N derniers messages, avec une auto-summarisation lorsque le contexte depasse la capacite. Une estimation de l\'importance est effectuee pour chaque message afin de prioriser les informations les plus pertinentes lors de la selection.'))

story.append(P('La memoire a long terme constitue le pilier de l\'apprentissage persistant. Elle utilise une recherche hybride combinant la recherche semantique par vecteurs (embeddings) et la recherche par mots-cles (BM25/TF-IDF), fusionnees via le Reciprocal Rank Fusion (RRF). Le score de pertinence composite combine quatre facteurs ponderes : recence (25%), frequence (20%), importance (25%), et pertinence semantique (30%). Les categories de memoire incluent les preferences, projets, documents, contexte de workflow, apprentissages d\'agents, memoires episodiques, et memoires semantiques.'))

story.append(P('La memoire episodique enregistre les experiences vecues par l\'agent avec une valence emotionnelle (positive ou negative) et des lecons apprises. Les experiences negatives (echecs) recoivent un bonus d\'importance de +0.1 car elles representent des lecons critiques. Le systeme de compression semantique groupe les memoires similaires (seuil de similarite 0.7) et les condense via LLM, eliminant les redondances tout en preservant les informations cles. L\'elagage automatique supprime les memoires de faible importance apres 90 jours, base sur le score composite.'))

story.append(P('L\'apprentissage automatique est un mecanisme fondamental : apres chaque execution d\'agent, les observations reussies (confiance > 0.7) sont automatiquement stockees dans la memoire a long terme avec la categorie "agent_learning" et des tags incluant le type d\'agent et l\'outil utilise. Ce mecanisme permet aux agents de s\'ameliorer continuellement au fil de leurs interactions.'))

# 2.4 Outils
story.append(H2('2.4 Registre d\'Outils et Systeme de Permissions'))

story.append(P('Le ToolRegistry est le coeur du systeme d\'execution des outils, implementant un pipeline a 7 etapes pour chaque appel : Permission Check, Capability Check, Execution Policy Check, Parameter Validation, Sandbox Check, Execution, et Result Parsing. Ce pipeline garantit que chaque execution d\'outil est securisee, validee, et observable.'))

story.append(P('Le systeme de permissions opere sur 5 couches distinctes. La Permission Layer gere les listes d\'outils autorises/interdits par utilisateur, avec une limite de 5 appels dangereux par session et des exigences d\'approbation pour les outils sensibles. Le Capability Manager accorde des capacites granulaires par agent avec des actions, portees, limites d\'appels, restrictions temporelles, et dates d\'expiration. L\'Execution Policy Manager applique des politiques regissant les types d\'actions (autoriser, interdire, limiter le debit, exiger une approbation, restreindre temporellement, limiter les ressources). Le Tool-Scoped Auth fournit des tokens d\'authentification OAuth-like par outil et par agent. Enfin, l\'Execution Sandbox isole chaque execution avec un timeout de 30 secondes par defaut.'))

story.append(P('Les outils disponibles incluent la recherche web (via z-ai-web-dev-sdk), le calcul mathematique, les requetes de base de donnees, les operations sur le systeme de fichiers (dangereux), et l\'execution de code JavaScript en bac a sable. L\'executeur de code bloque les appels require, import, process, fs, fetch, et eval, tout en fournissant des globals sures comme Math, JSON, et Array. Le Result Parser sanitize les sorties en masquant les cles API (sk-*, gsk_*), les tokens Bearer, et les chemins de fichiers sensibles.'))

# 2.5 Routeur IA
story.append(H2('2.5 Routeur IA Multi-Fournisseurs'))

story.append(P('Le routeur IA d\'Genova implemente une chaine de priorite avec basculement automatique entre trois fournisseurs. Groq occupe la priorite 1 avec les modeles llama-3.3-70b-versatile (defaut), llama-3.1-8b-instant (rapide), et llama-3.3-70b-versatile (puissant). OpenRouter constitue la priorite 2 avec meta-llama/llama-3.1-8b-instruct:free (defaut et rapide) et meta-llama/llama-3.1-70b-instruct (puissant). Le z-ai-web-dev-sdk sert de fallback universel lorsque aucune cle API directe n\'est disponible.'))

story.append(P('Le systeme de retry utilise un backoff exponentiel avec un delai initial de 500ms, un maximum de 3 tentatives par fournisseur, et un timeout de 60 secondes. Les erreurs transitoires (429, 5xx, timeout, reseau) declenchent un retry, tandis que les erreurs non-transitoires provoquent un basculement immediat vers le fournisseur suivant. L\'estimation des couts est calculee en temps reel avec les tarifs actuels de chaque fournisseur, et chaque appel est trace dans la table AICost avec le nombre de tokens, le cout en USD, et l\'identifiant de requete.'))

story.append(P('Le routeur supporte le streaming via async generators, permettant l\'affichage en temps reel des reponses dans l\'interface utilisateur. La fonction chatCompletion() offre une interface simplifiee avec des modes predefinis (default, fast, powerful, quick_chat, analysis, reasoning, orchestration) qui mappent automatiquement vers le tier de modele approprie.'))

# 2.6 Medias
story.append(H2('2.6 Generation de Medias (Images et Videos)'))

story.append(P('Le pipeline de generation d\'images implemente une chaine de secours a 2 niveaux avec validation et limitation du debit. Le niveau 1 utilise OpenRouter avec les modeles gratuits Flux-1-schnell-free et Stable-Diffusion-XL-free. Le niveau 2 bascule vers le z-ai-web-dev-sdk. Le systeme impose une limite de 10 images par heure par utilisateur, avec validation du prompt (suppression HTML, limitation a 2000 caracteres) et des dimensions (512/768/1024/1344). Chaque generation est tracee dans les tables ImageGeneration et AICost.'))

story.append(P('Le pipeline de generation de videos est plus elabore avec une chaine de secours a 3 niveaux. Le niveau 1 tente l\'API locale avec CogVideoX-2B (720x480, 49 frames, 8fps) ou VideoCrafter2 (512x320, 16 frames, 28fps) via un health check prealable. Le niveau 2 bascule vers Replicate Cloud API avec un polling de completion (intervalle 5s, maximum 120 tentatives, timeout 10 minutes). Le niveau 3 signale l\'indisponibilite si tous les fournisseurs echouent. La limite est de 5 videos par heure, avec des couts de 0 USD en local et 0.05 USD dans le cloud.'))

# 2.7 WhatsApp
story.append(H2('2.7 Integration WhatsApp'))

story.append(P('L\'integration WhatsApp repose sur une architecture a double canal avec basculement automatique. Le canal principal utilise Baileys (WhatsApp Web library) pour une connectivite directe sans frais, avec gestion des QR codes, sessions persistantes, et reconnexion automatique. Le canal de secours utilise l\'API WhatsApp Cloud v21.0 officielle de Meta, activee automatiquement apres 3 echecs consecutifs de Baileys, avec une tentative de retour a Baileys apres 5 minutes de recuperation.'))

story.append(P('Le pipeline de reponse automatique implemente un delai configurable de 10 secondes entre la reception d\'un message client et la reponse de l\'agent IA, simulant un comportement humain naturel. Le flux est : onMessage (evenement de reception) > attente de RESPONSE_DELAY_MS (10 000ms) > generation de la reponse via l\'IA > envoi via sendMessage. Le webhook WhatsApp Cloud API gere la verification GET (hub.mode + hub.verify_token) et la reception POST des messages entrants.'))

story.append(P('La securite WhatsApp inclut la sanitization des messages (suppression HTML, limitation a 4096 caracteres), la validation des numeros de telephone au format E.164, et le retry avec backoff exponentiel en cas d\'echec d\'envoi. La fonction sendImage() inclus une degradation gracieuse vers l\'envoi de texte si l\'image echoue.'))

# 2.8 Workflows
story.append(H2('2.8 Workflows et Orchestration Multi-Agents'))

story.append(P('Le systeme de workflows permet de definir des sequences d\'actions automatisees avec des declencheurs, des etapes, et un suivi de progression. Chaque workflow possede un statut (brouillon, actif, en pause, termine, echoue), un index de tache courant, et des etapes stockees en JSON. Les workflows sont orquestes via l\'API /api/workflows avec des endpoints de creation, lecture, mise a jour, suppression, et execution.'))

story.append(P('L\'orchestration multi-agents utilise le planificateur (Planner) pour decomposer un objectif complexe en sous-taches assignees a des agents specifiques avec gestion des dependances. L\'AgentManager coordonne l\'execution des plans multi-agents avec resolution des dependances : les taches dont les dependances sont satisfaites sont executees en premier, et les resultats des taches precedentes sont injectes comme contexte dans les taches dependantes. L\'evaluateur de plan (evaluatePlanProgress) determine si un plan necessite des ajustements en fonction des taches reussies et echouees.'))

# 2.9 Gardes-fous
story.append(H2('2.9 Gardes-fous et Validations'))

story.append(P('Le systeme de garde-fous (Guardrails) permet de definir des regles de securite que les agents doivent respecter pendant leur execution. Chaque garde-fou possede un nom, un type, une description, des regles (JSON), une severite (info, avertissement, critique), et un statut actif/inactif. Les regles peuvent bloquer des outils dangereux, interdire certaines actions, ou exiger une approbation humaine avant execution.'))

story.append(P('Lorsqu\'un agent tente d\'executer un outil dangereux alors que des garde-fous sont actifs, le systeme verifie chaque garde-fou actif pour determiner si l\'action doit etre bloquee. Si un garde-fou bloque l\'action, l\'agent passe en statut "awaiting_approval" et une demande d\'approbation est creee dans la table ApprovalRequest. L\'utilisateur peut ensuite approuver ou rejeter la demande via l\'interface ou l\'API.'))

story.append(P('Le validateur de prompts (PromptValidator) detecte les tentatives d\'injection dans les parametres des outils, avec un niveau de menace (low, medium, high) et une liste de risques identifies. Les parametres avec un niveau de menace "high" sont automatiquement rejetes, prevenant les attaques par injection de prompts.'))

# 2.10 Connaissances et RAG
story.append(H2('2.10 Base de Connaissances et RAG'))

story.append(P('Le systeme RAG (Retrieval-Augmented Generation) de Genova combine un retriever hybride avec un stockage vectoriel persistant. Le retriever utilise trois strategies de recherche : VectorStore (recherche semantique par embeddings), BM25 (recherche par mots-cles avec scoring probabiliste), et la fusion RRF (Reciprocal Rank Fusion) pour combiner les resultats. Le traitement des documents inclus le decoupage automatique en chunks, la generation d\'embeddings, et le stockage dans les tables Document et DocumentChunk.'))

story.append(P('L\'augmentation de prompts integre les resultats de recherche directement dans le contexte de l\'agent, avec des citations de sources permettant la tracabilite des informations. L\'extracteur de connaissances analyse les conversations terminees et extrait automatiquement les informations cles, decisions, et lecons apprises via LLM, les stockant dans la table Knowledge avec des categories et scores d\'importance.'))

# ═══════════════════════════════════════════════════════════
# 3. COMPORTEMENT DES AGENTS IA
# ═══════════════════════════════════════════════════════════
story.append(H1('3. Comportement detaille des Agents IA en execution'))

story.append(P('Cette section decrit en detail le comportement observable des agents IA pendant leur temps de fonctionnement, depuis l\'initialisation jusqu\'a la completion ou l\'echec, en passant par les mecanismes d\'adaptation et d\'apprentissage qui definissent leur autonomie.'))

story.append(H2('3.1 Cycle de vie d\'une execution'))

story.append(P('Lorsqu\'un utilisateur soumet une tache a un agent, le systeme cree un ExecutionContext complet incluant l\'identite de l\'agent, la tache, les outils disponibles, et la configuration. L\'execution demarre par le chargement asynchrone de la configuration agent depuis la base de donnees, du contexte de memoire a long terme pertinent via recherche hybride, et de la memoire a court terme depuis la conversation existante si applicable.'))

story.append(P('Un plan d\'execution initial est ensuite genere par LLM avec 3 a 5 etapes maximum, chacune avec une description, un indice d\'outil suggere, et des dependances optionnelles. Si la generation du plan echoue, un plan par defaut a 3 etapes est utilise (analyser, executer, verifier). Ce plan est adaptatif : la reflexion de l\'agent peut modifier le plan en cours d\'execution, chaque adaptation etant enregistree dans l\'historique du plan.'))

story.append(P('Pendant l\'execution, chaque etape est tracee par le Tracer avec des metriques detaillees : type d\'etape, contenu, duree, tokens utilises, modele et fournisseur. Les etapes sont transmises en temps reel via un callback onStep() pour l\'affichage dans l\'interface utilisateur. L\'etat global de l\'execution est periodiquement persiste dans la base de donnees pour permettre la reprise en cas d\'interruption.'))

story.append(H2('3.2 Mecanismes de decision et de reflexion'))

story.append(P('La phase THINK constitue le point de decision de l\'agent. Le prompt systeme inclus la mission, la configuration, la memoire a long terme, les outils disponibles, le contexte du plan, et l\'historique des 12 dernieres etapes. L\'agent doit repondre en JSON valide avec cinq champs : thought (raisonnement), action (outil ou "respond"), actionInput (parametres), isFinal (booleen), et confidence (0-1). Si le JSON est invalide, un fallback traite le contenu comme une reponse finale avec confiance 0.5.'))

story.append(P('La phase REFLECT est le mecanisme d\'autoevaluation le plus sophistique du systeme. L\'agent evalue les 5 dernieres etapes et produit une analyse structuree incluant : progressScore (0-1), qualityScore (0-1), needsRetry (booleen), needsAdaptation (booleen), reflection (analyse narrative), recommendation (continuer/retry/adapt/stop/respond), alternativeApproach (description), et confidenceInResult (0-1). Si le parsing echoue, le systeme effectue une evaluation simplifiee basee sur la presence d\'erreurs dans les etapes recentes.'))

story.append(P('Les recommandations de reflexion declenchent des actions specifiques : "retry" active le mecanisme d\'autocorrection avec une approche alternative, "adapt" modifie le plan d\'execution, "respond" fournit la reponse finale si la confiance est suffisante, "stop" arrete l\'execution avec un rapport d\'echec, et "continuer" poursuit la boucle normalement. Ce systeme permet a l\'agent de s\'auto-evaluer objectivement et de prendre des decisions eclairees sur la poursuite ou non de ses actions.'))

story.append(H2('3.3 Autocorrection et adaptation'))

story.append(P('Le mecanisme d\'autocorrection (retryWithCorrection) se declenche lorsque la reflexion recommande un reessai. L\'agent analyse l\'erreur rencontree, la derniere action tentee, et l\'approche alternative suggeree pour produire une action corrigee. Le prompt de correction demande a l\'agent d\'analyser pourquoi l\'action a echoue, de proposer une action corrigee avec de nouveaux parametres, et d\'indiquer si la correction est finale.'))

story.append(P('Le nombre de tentatives de correction est limite a maxRetries (3 par defaut). Lorsque la limite est atteinte, l\'execution se termine avec un statut "failed" et un rapport detaille de la derniere erreur. Chaque tentative est enregistree comme etape de type "retry" avec le compteur de tentatives, permettant une tracabilite complete du processus d\'autocorrection dans l\'historique d\'execution.'))

story.append(P('L\'adaptation du plan (adaptPlan) se declenche lorsque la reflexion recommande une adaptation. L\'etape courante du plan est marquee comme echouee, et l\'historique des adaptations enregistre la raison, le plan original, et le plan adapte. L\'agent peut ensuite reprendre la boucle THINK avec un contexte mis a jour incluant l\'echec et la nouvelle direction suggeree.'))

story.append(H2('3.4 Apprentissage automatique en cours d\'execution'))

story.append(P('L\'apprentissage automatique se produit a deux moments critiques du cycle de vie de l\'agent. Premierement, pendant l\'execution : chaque observation reussie (confiance > 0.7) est stockee dans la memoire a long terme comme entree de categorie "agent_learning" avec des tags incluant le type d\'agent et l\'outil utilise. Ce mecanisme permet a l\'agent d\'accumuler des connaissances procedurales au fil de ses executions.'))

story.append(P('Deuxiemement, apres l\'execution : la fonction saveExecution() extrait les observations reussies de l\'execution terminee et les stocke comme apprentissages dans la memoire a long terme. Chaque apprentissage est formate comme "Apprentissage de [nom_agent] : [contenu]" et recoit un score de pertinence egal a la confiance de l\'observation. Ces apprentissages sont ensuite disponibles pour les futures executions du meme agent ou d\'agents similaires via la recherche hybride.'))

story.append(P('L\'extraction de connaissances depuis les conversations (extractAndStore) represente un troisieme canal d\'apprentissage. Lorsqu\'une conversation se termine, le systeme utilise le LLM pour extraire les informations cles, decisions, et lecons apprises, puis les stocke dans la base de connaissances avec des categories et scores d\'importance. Si l\'extraction par LLM echoue, un fallback base sur l\'extraction de mots-cles est utilise pour garantir qu\'aucune connaissance n\'est perdue.'))

story.append(H2('3.5 Gestion des etats et reprise d\'execution'))

story.append(P('Le systeme de persistance d\'etat permet de sauvegarder l\'etat complet d\'une execution en cours et de la reprendre ulterieurement. La fonction saveExecutionState() utilise upsert dans la table AgentExecution, stockant les etapes en JSON, le statut, la duree totale, les tokens utilises, et le cout estime. La fonction loadExecutionState() recharge un etat paused et reconstruit le contexte d\'execution complet.'))

story.append(P('Pour le mode StateGraph, StatePersistence.save() enregistre l\'etat du graphe, le noeud courant, et le resume du detecteur de cycles dans un objet PersistedGraphState. La reprise (resume) restaure le detecteur de cycles avec les comptes de visites precedents et reprend l\'execution a partir du noeud suivant le noeud sauvegarde, garantissant la continuite du comportement de l\'agent meme apres une interruption.'))

# ═══════════════════════════════════════════════════════════
# 4. ARCHITECTURE TECHNIQUE
# ═══════════════════════════════════════════════════════════
story.append(H1('4. Architecture technique'))

story.append(H2('4.1 Structure des API (40+ endpoints)'))

story.append(P('L\'API de Genova expose plus de 40 endpoints organises en modules fonctionnels. Le module Auth (9 endpoints) gere l\'inscription, la connexion, la deconnexion, la verification email, et la gestion des sessions. Le module Agents (8 endpoints) permet la creation, mise a jour, suppression, chat (SSE streaming), execution, memoire, permissions, et basculement des agents. Le module AI (3 endpoints) offre le chat direct, l\'orchestration multi-agents, et la validation de prompts.'))

story.append(P('Le module Workflows (4 endpoints) gere le cycle de vie complet des workflows. Le module WhatsApp (4 endpoints) gere l\'envoi, la verification, la configuration, et les appels. Le module Social (3 endpoints) gere les comptes et publications. Les modules Images et Videos (4 endpoints) gerent la generation et le suivi des medias. Le module RAG (2 endpoints) gere le telechargement de documents et les requetes de connaissances.'))

story.append(P('Les modules Analytics (4 endpoints) fournissent les statistiques d\'utilisation, de performance des agents, de couts IA, et de monitoring systeme. Le module Admin (2 endpoints) gere la blocklist d\'URLs et les journaux d\'audit. Les modules supplementaires couvrent les conversations, activites, garde-fous, approbations, taches, ressources, file d\'attente, et dashboard.'))

story.append(H2('4.2 Base de donnees (31 tables PostgreSQL)'))

story.append(P('La base de donnees PostgreSQL de Genova contient 31 tables synchronisees via Prisma, organises en domaines fonctionnels. Le domaine Core (4 tables) comprend les utilisateurs, sessions, reinitialisations de mot de passe, et verifications d\'email. Le domaine Agents (6 tables) couvre les agents, permissions, journaux d\'actions, memoires, executions, et sessions navigateur.'))

story.append(P('Le domaine Workflows (4 tables) inclut les workflows, taches, validations, et garde-fous. Le domaine Communication (3 tables) gere les conversations, messages, et configurations WhatsApp. Le domaine Knowledge (3 tables) couvre les entrees de connaissance, documents, et chunks de documents. Le domaine Media (2 tables) trace les generations d\'images et de videos.'))

story.append(P('Le domaine Analytics (4 tables) comprend l\'utilisation des agents, les couts IA, l\'usage quotidien, et les evenements de monitoring. Le domaine Security (2 tables) couvre les journaux d\'audit et la blocklist d\'URLs. Le domaine Social (2 tables) gere les comptes sociaux. Le domaine Resources (1 table) stocke les ressources utilisateur. Des index strategiques sont places sur les champs frequemment requetes (role, dates, categories, severites) pour optimiser les performances.'))

# Tableau des 31 tables
story.append(Spacer(1, 12))
story.append(make_table(
    ['Domaine', 'Tables', 'Comptage'],
    [
        ['Core', 'users, sessions, password_resets, email_verifications', '4'],
        ['Agents', 'agents, agent_permissions, agent_action_logs, agent_memories, agent_executions, browser_sessions', '6'],
        ['Workflows', 'workflows, tasks, validations, guardrails', '4'],
        ['Communication', 'conversations, messages, whatsapp_configs', '3'],
        ['Knowledge', 'knowledge, documents, document_chunks', '3'],
        ['Media', 'image_generations, video_generations', '2'],
        ['Analytics', 'agent_usage, ai_costs, usage_daily, monitoring_events', '4'],
        ['Security', 'audit_logs, url_blocklist, approval_requests', '3'],
        ['Social', 'social_accounts, user_resources', '2'],
    ],
    [0.15, 0.65, 0.10]
))
story.append(Spacer(1, 6))
story.append(P('Tableau 3 : Domaines fonctionnels de la base de donnees', ParagraphStyle('caption3', fontName='NotoSerifSC', fontSize=8.5, alignment=TA_CENTER, textColor=TEXT_MUTED)))

story.append(H2('4.3 Streaming et observabilite'))

story.append(P('Le systeme de streaming SSE (Server-Sent Events) gere la diffusion en temps reel des reponses des agents. Le StreamManager inclus un TokenBuffer pour le batch des tokens, un EventBatcher pour l\'optimisation de l\'envoi, un ProgressTracker pour le suivi de progression, et un mecanisme de backpressure pour eviter la surcharge. Le systeme de heartbeat maintient les connexions actives et detecte les deconnexions.'))

story.append(P('Le WebSocket manager complement le SSE pour les evenements en temps reel du flux agent (nouvelles etapes, changements de statut, demandes d\'approbation). L\'observabilite est assuree par le Tracer qui suit chaque execution d\'agent avec un identifiant de trace unique, des metriques par etape, et une aggregation des statistiques (duree moyenne, cout, taux d\'erreur).'))

# ═══════════════════════════════════════════════════════════
# 5. SERVICES LOCAUX
# ═══════════════════════════════════════════════════════════
story.append(H1('5. Services locaux et infrastructure'))

story.append(P('Genova s\'appuie sur une infrastructure locale complete pour assurer l\'autonomie et la performance du systeme. Chaque service est installe et configure localement sur le serveur, reduisant la dependance aux services cloud externes et ameliorant la latence.'))

story.append(Spacer(1, 8))
story.append(make_table(
    ['Service', 'Port', 'Role', 'Statut'],
    [
        ['PostgreSQL', '5432', 'Base de donnees principale (31 tables)', 'Operationnel'],
        ['PocketBase', '8090', 'Cache, fichiers, donnees d\'apprentissage', 'Operationnel'],
        ['n8n', '5678', 'Automatisation de workflows', 'Operationnel (v2.22.5)'],
        ['ComfyUI', '8188', 'Generation d\'images locale', 'Necessite checkpoint'],
        ['API Video', '8189', 'CogVideoX-2B / VideoCrafter2', 'Configure'],
        ['Next.js', '3000', 'Application SaaS', 'Operationnel'],
        ['Caddy', '81', 'Reverse proxy', 'Configure'],
    ],
    [0.18, 0.10, 0.47, 0.25]
))
story.append(Spacer(1, 6))
story.append(P('Tableau 4 : Infrastructure locale de Genova', ParagraphStyle('caption4', fontName='NotoSerifSC', fontSize=8.5, alignment=TA_CENTER, textColor=TEXT_MUTED)))

story.append(P('Les scripts de gestion centralises (start-all.sh et stop-all.sh) permettent de demarrer et arreter tous les services en une seule commande. Le demarrage suit un ordre precis pour gerer les dependances : PostgreSQL en premier, puis PocketBase, n8n, ComfyUI, et enfin l\'application Next.js. Chaque service est lance en arriere-plan avec verification de sante.'))

# ═══════════════════════════════════════════════════════════
# 6. INTERFACE UTILISATEUR
# ═══════════════════════════════════════════════════════════
story.append(H1('6. Interface utilisateur'))

story.append(P('L\'interface utilisateur de Genova est une single-page application (SPA) construite avec React 19 et Tailwind CSS 4, offrant 10 vues principales accessibles via une navigation laterale geree par Zustand. Le layout comprend un en-tete (AppHeader) et une barre laterale (AppSidebar) avec navigation par icones et labels.'))

story.append(P('Les vues disponibles incluent le Dashboard (statistiques globales, activite recente, alertes), les Agents (liste, creation, detail avec chat en temps reel, monitoring d\'execution), l\'Automatisation (gestion des workflows), les Gardes-fous (configuration des regles de securite), la Coordination (orchestration multi-agents, constructeur visuel de workflows), les Parametres (configuration generale, approbations), les Analyses (tableaux de bord avec graphiques), les Medias (galerie de generation d\'images et videos), et les Connaissances (gestion de la base de connaissances).'))

story.append(P('La bibliotheque de composants UI comprend plus de 40 composants shadcn/ui (accordion, alert, avatar, badge, button, card, dialog, dropdown-menu, form, input, select, table, tabs, toast, tooltip, etc.) assurant une coherence visuelle a travers toute l\'application. Les animations sont gerees par Framer Motion pour des transitions fluides entre les vues et les etats des composants.'))

# ═══════════════════════════════════════════════════════════
# 7. POINTS D'ATTENTION
# ═══════════════════════════════════════════════════════════
story.append(H1('7. Points d\'attention et ameliorations futures'))

story.append(P('Malgre la solidite architecturale de Genova, plusieurs points meritent une attention particuliere pour ameliorer la robustesse et la securite du systeme en production.'))

story.append(H2('7.1 Elements fonctionnels mais necessitant des ameliorations'))

story.append(P('ComfyUI necessite le telechargement d\'un checkpoint de modele pour la generation d\'images locale. Actuellement, le systeme bascule vers OpenRouter et z-ai-sdk, mais l\'activation de ComfyUI permettrait une generation d\'images gratuite et rapide en local. Baileys requiert le scan d\'un QR code pour connecter WhatsApp Web, une operation manuelle necessaire avant chaque nouvelle session. n8n necessite la generation et la configuration d\'une cle API dans le fichier .env pour l\'integration programmatique.'))

story.append(P('Le systeme d\'authentification pourrait beneficier de refresh tokens plus robustes avec rotation automatique, d\'un durcissement RBAC avec permissions granulaires par ressource, et d\'un systeme d\'audit plus complet avec alertes en temps reel. La base de donnees SQLite utilisee en developpement devrait etre migree vers PostgreSQL en production pour une meilleure concurrence et scalabilite.'))

story.append(H2('7.2 Ameliorations architecturales recommandees'))

story.append(P('L\'ajout d\'un systeme de file d\'attente persistant (Redis/Bull) pour les taches asynchrones ameliorerait la fiabilite du systeme de jobs. L\'implementation d\'un systeme de cache distribue (Redis) pour les sessions et les donnees frequemment accedees reduirait la charge sur PostgreSQL. L\'ajout de tests unitaires et d\'integration couvrant les chemins critiques (auth, execution d\'agents, generation de medias) garantirait la non-regression lors des evolutions.'))

story.append(P('Le monitoring pourrait etre enrichi avec des metriques Prometheus/Grafana pour la surveillance en temps reel des performances. L\'ajout d\'un systeme de rate limiting persistant (au lieu de en-memoire) partagerait les limites entre les instances. Enfin, l\'implementation d\'un systeme de versionnage des agents permettrait de revenir a une configuration anterieure en cas de probleme.'))

# ═══════════════════════════════════════════════════════════
# BUILD
# ═══════════════════════════════════════════════════════════
doc.multiBuild(story)
print(f"PDF generated: {OUTPUT}")

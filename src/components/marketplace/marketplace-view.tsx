'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Search, Star, Download, ShoppingBag, Package, Bot, GitBranch, FileCode, Plug,
  Filter, Plus, StarHalf, ExternalLink, CheckCircle2, Coins, Eye
} from 'lucide-react';

interface Listing {
  id: string;
  type: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  currency: string;
  downloads: number;
  rating: number;
  reviewCount: number;
  author?: { name: string; avatar: string | null };
  createdAt: string;
  status: string;
}

interface Review {
  id: string;
  userId: string;
  rating: number;
  title: string;
  content: string;
  author?: { name: string; avatar: string | null };
  createdAt: string;
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  agent: <Bot className="h-5 w-5" />,
  workflow: <GitBranch className="h-5 w-5" />,
  template: <FileCode className="h-5 w-5" />,
  plugin: <Plug className="h-5 w-5" />,
};

const CATEGORIES = ['all', 'general', 'productivity', 'development', 'marketing', 'sales', 'support', 'research', 'finance', 'hr', 'creative'];

export function MarketplaceView() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewContent, setReviewContent] = useState('');

  // Create listing form
  const [createForm, setCreateForm] = useState({
    name: '',
    type: 'agent' as string,
    description: '',
    category: 'general',
    price: 0,
    tags: '',
  });

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) params.set('q', searchQuery);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      params.set('sort', sortBy);
      params.set('limit', '30');

      const data = await apiFetch<{ listings: Listing[]; total: number }>(`/api/marketplace/listings?${params.toString()}`);
      setListings(data.listings || []);
    } catch {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, typeFilter, categoryFilter, sortBy]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const fetchReviews = async (listingId: string) => {
    try {
      const data = await apiFetch<{ reviews: Review[] }>(`/api/marketplace/reviews?listingId=${listingId}&limit=10`);
      setReviews(data.reviews || []);
    } catch {
      setReviews([]);
    }
  };

  const handleSelectListing = (listing: Listing) => {
    setSelectedListing(listing);
    fetchReviews(listing.id);
  };

  const handleCreateListing = async () => {
    try {
      await apiFetch('/api/marketplace/listings', {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          tags: createForm.tags.split(',').map((t) => t.trim()).filter(Boolean),
        }),
      });
      setShowCreateDialog(false);
      setCreateForm({ name: '', type: 'agent', description: '', category: 'general', price: 0, tags: '' });
      fetchListings();
    } catch {
      // Silently fail
    }
  };

  const handlePurchase = async (listingId: string) => {
    try {
      await apiFetch('/api/marketplace/purchases', {
        method: 'POST',
        body: JSON.stringify({ listingId }),
      });
      fetchListings();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Purchase failed';
      alert(message);
    }
  };

  const handleAddReview = async () => {
    if (!selectedListing) return;
    try {
      await apiFetch('/api/marketplace/reviews', {
        method: 'POST',
        body: JSON.stringify({
          listingId: selectedListing.id,
          rating: reviewRating,
          content: reviewContent,
        }),
      });
      setShowReviewDialog(false);
      setReviewContent('');
      setReviewRating(5);
      fetchReviews(selectedListing.id);
      fetchListings();
    } catch {
      // Silently fail
    }
  };

  const renderStars = (rating: number, size: 'sm' | 'md' = 'sm') => {
    const stars: React.ReactNode[] = [];
    const sizeClass = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`${sizeClass} ${i <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`}
        />
      );
    }
    return <div className="flex gap-0.5">{stars}</div>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Marketplace</h1>
          <p className="text-muted-foreground">Discover, share, and purchase AI agents, workflows, and templates</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Listing
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Marketplace Listing</DialogTitle>
              <DialogDescription>Share your AI creation with the community</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="My AI Agent" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Type</Label>
                  <Select value={createForm.type} onValueChange={(v) => setCreateForm({ ...createForm, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="workflow">Workflow</SelectItem>
                      <SelectItem value="template">Template</SelectItem>
                      <SelectItem value="plugin">Plugin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Category</Label>
                  <Select value={createForm.category} onValueChange={(v) => setCreateForm({ ...createForm, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                        <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Description</Label>
                <Textarea value={createForm.description} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} placeholder="Describe what your listing does..." rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Price (credits, 0 = free)</Label>
                  <Input type="number" min={0} value={createForm.price} onChange={(e) => setCreateForm({ ...createForm, price: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="grid gap-2">
                  <Label>Tags (comma-separated)</Label>
                  <Input value={createForm.tags} onChange={(e) => setCreateForm({ ...createForm, tags: e.target.value })} placeholder="ai, automation, sales" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreateListing} disabled={!createForm.name || !createForm.description}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Search marketplace..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="agent">Agents</SelectItem>
                <SelectItem value="workflow">Workflows</SelectItem>
                <SelectItem value="template">Templates</SelectItem>
                <SelectItem value="plugin">Plugins</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c === 'all' ? 'All Categories' : c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Sort" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="popular">Most Popular</SelectItem>
                <SelectItem value="rating">Top Rated</SelectItem>
                <SelectItem value="price_asc">Price: Low</SelectItem>
                <SelectItem value="price_desc">Price: High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="browse" className="space-y-4">
        <TabsList>
          <TabsTrigger value="browse" className="gap-2"><Package className="h-4 w-4" />Browse</TabsTrigger>
          <TabsTrigger value="purchases" className="gap-2"><ShoppingBag className="h-4 w-4" />My Purchases</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="p-6"><div className="h-40 bg-muted rounded" /></CardContent></Card>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Package className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No listings found</h3>
                <p className="text-muted-foreground text-sm">Try adjusting your search or filters</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((listing) => (
                <Card
                  key={listing.id}
                  className="cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => handleSelectListing(listing)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary">
                          {TYPE_ICONS[listing.type] || <Package className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">{listing.name}</CardTitle>
                          <CardDescription className="text-xs">{listing.author?.name || 'Unknown'}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs shrink-0">{listing.type}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{listing.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          {renderStars(listing.rating)}
                          <span className="text-xs text-muted-foreground ml-1">({listing.reviewCount})</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Download className="h-3 w-3" />{listing.downloads}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {listing.price === 0 ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Free</Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                            <Coins className="h-3 w-3 mr-1" />{listing.price}
                          </Badge>
                        )}
                      </div>
                    </div>
                    {listing.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {listing.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                        ))}
                        {listing.tags.length > 3 && (
                          <Badge variant="outline" className="text-[10px]">+{listing.tags.length - 3}</Badge>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="purchases">
          <PurchasesTab />
        </TabsContent>
      </Tabs>

      {/* Listing Detail Dialog */}
      <Dialog open={!!selectedListing} onOpenChange={(open) => { if (!open) setSelectedListing(null); }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {selectedListing && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    {TYPE_ICONS[selectedListing.type] || <Package className="h-5 w-5" />}
                  </div>
                  <div>
                    <DialogTitle>{selectedListing.name}</DialogTitle>
                    <DialogDescription>by {selectedListing.author?.name || 'Unknown'} &middot; {selectedListing.type}</DialogDescription>
                  </div>
                </div>
              </DialogHeader>
              <ScrollArea className="flex-1 -mx-6 px-6">
                <div className="space-y-4 py-2">
                  <p className="text-sm">{selectedListing.description}</p>
                  <div className="flex items-center gap-4">
                    {renderStars(selectedListing.rating, 'md')}
                    <span className="text-sm text-muted-foreground">{selectedListing.rating.toFixed(1)} ({selectedListing.reviewCount} reviews)</span>
                    <span className="text-sm text-muted-foreground flex items-center gap-1"><Download className="h-3.5 w-3.5" />{selectedListing.downloads} downloads</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {selectedListing.tags.map((tag) => (
                      <Badge key={tag} variant="outline">{tag}</Badge>
                    ))}
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="text-lg font-semibold">
                      {selectedListing.price === 0 ? 'Free' : `${selectedListing.price} credits`}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setShowReviewDialog(true)}>
                        <Star className="h-4 w-4 mr-1" />Review
                      </Button>
                      <Button size="sm" onClick={() => handlePurchase(selectedListing.id)}>
                        {selectedListing.price === 0 ? <Download className="h-4 w-4 mr-1" /> : <ShoppingBag className="h-4 w-4 mr-1" />}
                        {selectedListing.price === 0 ? 'Get Free' : `Buy (${selectedListing.price} credits)`}
                      </Button>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-medium mb-2">Reviews</h4>
                    {reviews.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No reviews yet</p>
                    ) : (
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {reviews.map((review) => (
                          <div key={review.id} className="flex gap-3 p-3 rounded-lg bg-muted/50">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-primary">{review.author?.name?.charAt(0) || '?'}</span>
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{review.author?.name || 'User'}</span>
                                {renderStars(review.rating)}
                              </div>
                              {review.content && <p className="text-sm text-muted-foreground mt-1">{review.content}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Write a Review</DialogTitle>
            <DialogDescription>Share your experience with this listing</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2">
              <Label>Rating:</Label>
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={`h-6 w-6 cursor-pointer ${i < reviewRating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`}
                    onClick={() => setReviewRating(i + 1)}
                  />
                ))}
              </div>
            </div>
            <Textarea value={reviewContent} onChange={(e) => setReviewContent(e.target.value)} placeholder="Write your review..." rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReviewDialog(false)}>Cancel</Button>
            <Button onClick={handleAddReview}>Submit Review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Purchases Tab Component
function PurchasesTab() {
  const [purchases, setPurchases] = useState<Array<{
    id: string;
    amount: number;
    status: string;
    purchasedAt: string;
    listing?: { name: string; type: string };
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPurchases() {
      try {
        const data = await apiFetch<{ purchases: typeof purchases }>('/api/marketplace/purchases?limit=20');
        setPurchases(data.purchases || []);
      } catch {
        setPurchases([]);
      } finally {
        setLoading(false);
      }
    }
    fetchPurchases();
  }, []);

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (purchases.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ShoppingBag className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium">No purchases yet</h3>
          <p className="text-muted-foreground text-sm">Browse the marketplace to find agents and templates</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {purchases.map((purchase) => (
        <Card key={purchase.id}>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                {TYPE_ICONS[purchase.listing?.type || ''] || <Package className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-medium">{purchase.listing?.name || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">{new Date(purchase.purchasedAt).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{purchase.amount === 0 ? 'Free' : `${purchase.amount} credits`}</Badge>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

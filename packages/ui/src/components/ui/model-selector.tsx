"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Check, RefreshCw, Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { api, type FetchedModel, type FetchModelsError, FetchModelsAPIError } from "@/lib/api"

interface ModelSelectorProps {
  baseUrl: string;
  apiKey: string;
  selectedModels: string[];
  onAddModels: (models: string[]) => void;
  onRemoveModel?: (model: string) => void;
  onError?: (error: FetchModelsError) => void;
}

const CACHE_DURATION_MS = 30000;

export function ModelSelector({
  baseUrl,
  apiKey,
  selectedModels,
  onAddModels,
  onRemoveModel,
  onError,
}: ModelSelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [models, setModels] = React.useState<FetchedModel[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [lastFetchedAt, setLastFetchedAt] = React.useState<number | null>(null);
  const pendingRequestRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    setSelected(new Set());
  }, [selectedModels]);

  React.useEffect(() => {
    return () => {
      if (pendingRequestRef.current) {
        pendingRequestRef.current.abort();
      }
    };
  }, []);

  const handleFetch = React.useCallback(async () => {
    if (isLoading) return;

    if (pendingRequestRef.current) {
      pendingRequestRef.current.abort();
      pendingRequestRef.current = null;
    }

    if (lastFetchedAt && Date.now() - lastFetchedAt < CACHE_DURATION_MS) {
      setOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      const fetchedModels = await api.fetchProviderModels(baseUrl, apiKey);
      setModels(fetchedModels);
      setLastFetchedAt(Date.now());
      setOpen(true);
    } catch (err: unknown) {
      if (err instanceof FetchModelsAPIError) {
        onError?.(err.error);
      } else if (err instanceof Error && err.name !== 'AbortError') {
        onError?.({ code: 'UNKNOWN', message: err.message });
      }
    } finally {
      setIsLoading(false);
      pendingRequestRef.current = null;
    }
  }, [baseUrl, apiKey, isLoading, lastFetchedAt, onError]);

  const handleToggleModel = (modelId: string) => {
    if (selectedModels.includes(modelId)) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    const newModels = Array.from(selected).filter(m => !selectedModels.includes(m));
    if (newModels.length > 0) {
      onAddModels(newModels);
    }
    setOpen(false);
    setSelected(new Set());
  };

  const uniqueModels = React.useMemo(() => {
    const seen = new Set<string>();
    return models.filter(m => {
      const trimmed = m.id.trim();
      if (!trimmed || seen.has(trimmed)) return false;
      seen.add(trimmed);
      return true;
    });
  }, [models]);

  const filteredModels = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return uniqueModels;
    return uniqueModels.filter(m => m.id.toLowerCase().includes(q));
  }, [uniqueModels, searchQuery]);

  const sortedModels = React.useMemo(() => {
    return [...filteredModels].sort((a, b) => {
      const aAdded = selectedModels.includes(a.id) ? 0 : 1;
      const bAdded = selectedModels.includes(b.id) ? 0 : 1;
      return aAdded - bAdded;
    });
  }, [filteredModels, selectedModels]);

  const hasNewSelections = Array.from(selected).some(m => !selectedModels.includes(m));

  return (
    <Popover modal={false} open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        setSelected(new Set());
      }
      setOpen(newOpen);
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={isLoading}
          onClick={(e) => {
            e.preventDefault();
            handleFetch();
          }}
        >
          {isLoading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="ml-2">{t("providers.fetching_models")}</span>
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              <span className="ml-2">{t("providers.fetch_available_models")}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 h-9">
          <Search className="size-4 shrink-0 opacity-50" />
          <input
            className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            placeholder={t("providers.search_models")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div
          className="max-h-[300px] overflow-y-auto"
          onWheel={(e) => {
            const el = e.currentTarget;
            const atTop = el.scrollTop === 0;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight;
            const goingUp = e.deltaY < 0;
            const goingDown = e.deltaY > 0;
            if ((goingUp && atTop) || (goingDown && atBottom)) return;
            e.preventDefault();
            el.scrollTop += e.deltaY;
          }}
        >
          {sortedModels.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              {t("providers.no_models_found")}
            </div>
          ) : (
            <div className="p-1">
              {sortedModels.map((model) => {
                const isAdded = selectedModels.includes(model.id);
                const isSelected = selected.has(model.id);
                return (
                  <div
                    key={model.id}
                    className={cn(
                      "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-default select-none",
                      isSelected && !isAdded && "bg-accent text-accent-foreground",
                      isAdded && "opacity-60"
                    )}
                    onClick={() => !isAdded && handleToggleModel(model.id)}
                  >
                      {!isAdded && (
                        <Check
                          className={cn(
                            "mr-1 h-4 w-4 shrink-0",
                            isSelected ? "opacity-100" : "opacity-0"
                          )}
                        />
                      )}
                      <span className="flex-1 truncate">{model.id}</span>
                      {isAdded && onRemoveModel && (
                        <button
                          className="ml-1 p-0.5 rounded-sm hover:bg-destructive/10 hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveModel(model.id);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        <div className="border-t p-2">
          <Button
            size="sm"
            className="w-full"
            disabled={!hasNewSelections}
            onClick={handleAddSelected}
          >
            {t("providers.add_selected_models", { count: Array.from(selected).filter(m => !selectedModels.includes(m)).length })}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

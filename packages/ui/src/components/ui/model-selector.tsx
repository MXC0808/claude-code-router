"use client"

import * as React from "react"
import { useTranslation } from "react-i18next"
import { Check, RefreshCw, Search } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
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
  onError?: (error: FetchModelsError) => void;
}

const CACHE_DURATION_MS = 30000;

export function ModelSelector({
  baseUrl,
  apiKey,
  selectedModels,
  onAddModels,
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

  const filteredModels = React.useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(m => m.id.toLowerCase().includes(q));
  }, [models, searchQuery]);

  const selectableModels = filteredModels;
  const hasNewSelections = Array.from(selected).some(m => !selectedModels.includes(m));

  return (
    <Popover open={open} onOpenChange={(newOpen) => {
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
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t("providers.search_models")}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>{t("providers.no_models_found")}</CommandEmpty>
            <CommandGroup>
              {selectableModels.map((model) => (
                <CommandItem
                  key={model.id}
                  onSelect={() => handleToggleModel(model.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      selected.has(model.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{model.id}</span>
                  {selectedModels.includes(model.id) && (
                    <Badge variant="outline" className="ml-2 text-xs text-gray-400">
                      {t("providers.already_added")}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
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
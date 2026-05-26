import { useTranslation } from "react-i18next";
import { Copy, Wifi, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Provider } from "@/types";

interface ProviderListProps {
  providers: Provider[];
  onEdit: (index: number) => void;
  onTest: (index: number) => void;
  onRemove: (index: number) => void;
  onCopy: (index: number) => void;
}

function ActionButton({
  icon: Icon,
  variant,
  tooltip,
  onClick,
  className = "",
}: {
  icon: React.ComponentType<{ className?: string }>;
  variant: "ghost" | "destructive";
  tooltip: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size="icon"
          onClick={onClick}
          aria-label={tooltip}
          className={`transition-all-ease hover:scale-110 ${className}`}
        >
          <Icon className="h-4 w-4 text-current transition-colors duration-200" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function ProviderRow({
  provider,
  index,
  onEdit,
  onTest,
  onRemove,
  onCopy,
}: {
  provider: Provider;
  index: number;
  onEdit: (index: number) => void;
  onTest: (index: number) => void;
  onRemove: (index: number) => void;
  onCopy: (index: number) => void;
}) {
  const { t } = useTranslation();
  const models = Array.isArray(provider.models) ? provider.models : [];

  return (
    <div className="flex items-start justify-between rounded-md border bg-white p-4 transition-all hover:shadow-md animate-slide-in hover:scale-[1.01]">
      <div className="flex-1 space-y-1.5">
        <p className="text-md font-semibold text-gray-800">{provider.name || "Unnamed Provider"}</p>
        <p className="text-sm text-gray-500">{provider.api_base_url || "No API URL"}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          {models.map((model, modelIndex) => (
            <Badge key={modelIndex} variant="outline" className="font-normal transition-all-ease hover:scale-105">
              {model || "Unnamed Model"}
            </Badge>
          ))}
        </div>
      </div>
      <div className="ml-4 flex flex-shrink-0 items-center gap-2">
        <ActionButton
          icon={Copy}
          variant="ghost"
          tooltip={t("providers.copy")}
          onClick={() => onCopy(index)}
        />
        <ActionButton
          icon={Wifi}
          variant="ghost"
          tooltip={t("providers.test")}
          onClick={() => onTest(index)}
        />
        <ActionButton
          icon={Pencil}
          variant="ghost"
          tooltip={t("providers.edit")}
          onClick={() => onEdit(index)}
        />
        <ActionButton
          icon={Trash2}
          variant="destructive"
          tooltip={t("providers.delete")}
          onClick={() => onRemove(index)}
          className="transition-all duration-200"
        />
      </div>
    </div>
  );
}

export function ProviderList({
  providers,
  onEdit,
  onTest,
  onRemove,
  onCopy,
}: ProviderListProps) {
  if (!providers || !Array.isArray(providers)) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-center rounded-md border bg-white p-8 text-gray-500">
          No providers configured
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-3">
        {providers.map((provider, index) => (
          <ProviderRow
            key={index}
            provider={provider}
            index={index}
            onEdit={onEdit}
            onTest={onTest}
            onRemove={onRemove}
            onCopy={onCopy}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}

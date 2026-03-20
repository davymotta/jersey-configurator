import { useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, Download, Save, Check } from "lucide-react";
import { toast } from "sonner";

import { JERSEY_TEMPLATES, getTemplate, type JerseyTemplateDefinition } from "@shared/jerseyTemplates";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import JerseyCanvas from "@/components/JerseyCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getLoginUrl } from "@/const";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function exportSvg(svgEl: SVGSVGElement | null, name: string) {
  if (!svgEl) return;
  const blob = new Blob([svgEl.outerHTML], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/\s+/g, "_")}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TemplateCard({
  template,
  selected,
  onClick,
}: {
  template: JerseyTemplateDefinition;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl border-2 p-3 text-left transition-all hover:shadow-md focus:outline-none ${
        selected
          ? "border-blue-600 bg-blue-50 shadow-md"
          : "border-gray-200 bg-white hover:border-blue-300"
      }`}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
          <Check size={12} />
        </span>
      )}
      <div className="flex justify-center mb-2">
        <JerseyCanvas
          template={template}
          colors={template.defaultColors}
          width={80}
          height={100}
        />
      </div>
      <p className="text-sm font-semibold text-gray-800">{template.name}</p>
      <p className="text-xs text-gray-500">{template.description}</p>
    </button>
  );
}

function ColorZoneRow({
  label,
  color,
  onChange,
}: {
  label: string;
  color: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="w-28 shrink-0 text-sm">{label}</Label>
      <div className="flex flex-1 items-center gap-2">
        <input
          type="color"
          value={color}
          onChange={e => onChange(e.target.value)}
          className="h-8 w-12 cursor-pointer rounded border border-gray-300 p-0.5"
        />
        <Input
          value={color}
          onChange={e => onChange(e.target.value)}
          maxLength={7}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Configurator() {
  const params = useParams<{ id?: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();

  const editId = params.id ? parseInt(params.id, 10) : undefined;
  const isEditing = editId !== undefined;

  // Load existing jersey when editing
  const existingJersey = trpc.jersey.get.useQuery(
    { id: editId! },
    { enabled: isEditing && isAuthenticated },
  );

  // Mutations
  const createMutation = trpc.jersey.create.useMutation();
  const updateMutation = trpc.jersey.update.useMutation();

  // ── Local state ──
  const [selectedTemplate, setSelectedTemplate] = useState<JerseyTemplateDefinition>(
    JERSEY_TEMPLATES[0],
  );
  const [colors, setColors] = useState<Record<string, string>>(
    JERSEY_TEMPLATES[0].defaultColors,
  );
  const [designName, setDesignName] = useState("My Jersey");
  const [playerName, setPlayerName] = useState("");
  const [playerNumber, setPlayerNumber] = useState("");
  const [teamName, setTeamName] = useState("");
  const [textColor, setTextColor] = useState("#ffffff");
  const svgRef = useRef<SVGSVGElement>(null);

  // Populate state when editing an existing jersey
  useEffect(() => {
    if (existingJersey.data) {
      const d = existingJersey.data;
      const tpl = getTemplate(d.templateId) ?? JERSEY_TEMPLATES[0];
      setSelectedTemplate(tpl);
      setColors(d.colors as Record<string, string>);
      setDesignName(d.name);
      setPlayerName(d.playerName ?? "");
      setPlayerNumber(d.playerNumber ?? "");
      setTeamName(d.teamName ?? "");
      setTextColor(d.textColor);
    }
  }, [existingJersey.data]);

  // When the template changes reset colors to that template's defaults
  const handleSelectTemplate = (tpl: JerseyTemplateDefinition) => {
    setSelectedTemplate(tpl);
    setColors(tpl.defaultColors);
  };

  const handleColorChange = (zoneId: string, hex: string) => {
    setColors(prev => ({ ...prev, [zoneId]: hex }));
  };

  const handleSave = async () => {
    if (!isAuthenticated) {
      toast.error("Please sign in to save your design.");
      return;
    }

    const payload = {
      templateId: selectedTemplate.id,
      name: designName || "My Jersey",
      colors,
      playerName: playerName || undefined,
      playerNumber: playerNumber || undefined,
      teamName: teamName || undefined,
      textColor,
    };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: editId!, ...payload });
        toast.success("Jersey updated!");
      } else {
        const result = await createMutation.mutateAsync(payload);
        toast.success("Jersey saved!");
        navigate(`/configurator/${result.id}`);
      }
    } catch {
      toast.error("Failed to save. Please try again.");
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft size={18} />
          </Button>
          <Input
            value={designName}
            onChange={e => setDesignName(e.target.value)}
            className="w-48 border-0 text-lg font-semibold shadow-none focus-visible:ring-0"
            placeholder="Design name…"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportSvg(svgRef.current, designName)}
          >
            <Download size={14} className="mr-1" />
            Export SVG
          </Button>
          {isAuthenticated ? (
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              <Save size={14} className="mr-1" />
              {isSaving ? "Saving…" : isEditing ? "Update" : "Save"}
            </Button>
          ) : (
            <Button size="sm" asChild>
              <a href={getLoginUrl()}>Sign in to save</a>
            </Button>
          )}
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:flex-row md:items-start">
        {/* ── Left panel: controls ── */}
        <aside className="w-full shrink-0 space-y-4 md:w-80">
          <Tabs defaultValue="template">
            <TabsList className="w-full">
              <TabsTrigger value="template" className="flex-1">Template</TabsTrigger>
              <TabsTrigger value="colors" className="flex-1">Colors</TabsTrigger>
              <TabsTrigger value="text" className="flex-1">Text</TabsTrigger>
            </TabsList>

            {/* Template tab */}
            <TabsContent value="template">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Choose a template</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    {JERSEY_TEMPLATES.map(tpl => (
                      <TemplateCard
                        key={tpl.id}
                        template={tpl}
                        selected={selectedTemplate.id === tpl.id}
                        onClick={() => handleSelectTemplate(tpl)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Colors tab */}
            <TabsContent value="colors">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Zone colors</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selectedTemplate.zones.map(zone => (
                    <ColorZoneRow
                      key={zone.id}
                      label={zone.label}
                      color={colors[zone.id] ?? selectedTemplate.defaultColors[zone.id] ?? "#cccccc"}
                      onChange={hex => handleColorChange(zone.id, hex)}
                    />
                  ))}
                  <div className="mt-4 border-t pt-3">
                    <ColorZoneRow
                      label="Text color"
                      color={textColor}
                      onChange={setTextColor}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Text tab */}
            <TabsContent value="text">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Text & numbers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="teamName">Team name</Label>
                    <Input
                      id="teamName"
                      value={teamName}
                      onChange={e => setTeamName(e.target.value)}
                      placeholder="e.g. LIONS"
                      maxLength={24}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="playerNumber">Player number</Label>
                    <Input
                      id="playerNumber"
                      value={playerNumber}
                      onChange={e => setPlayerNumber(e.target.value)}
                      placeholder="e.g. 10"
                      maxLength={3}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="playerName">Player name</Label>
                    <Input
                      id="playerName"
                      value={playerName}
                      onChange={e => setPlayerName(e.target.value)}
                      placeholder="e.g. SMITH"
                      maxLength={20}
                    />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </aside>

        {/* ── Right panel: preview ── */}
        <main className="flex flex-1 flex-col items-center justify-start gap-4 pt-4">
          <div className="rounded-2xl bg-white p-8 shadow-md">
            <JerseyCanvas
              ref={svgRef}
              template={selectedTemplate}
              colors={colors}
              playerName={playerName}
              playerNumber={playerNumber}
              teamName={teamName}
              textColor={textColor}
              width={320}
              height={400}
            />
          </div>
          <p className="text-xs text-gray-400">
            Live preview · {selectedTemplate.name} template
          </p>
        </main>
      </div>
    </div>
  );
}

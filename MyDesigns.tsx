import { useLocation } from "wouter";
import { Plus, Pencil, Trash2, Shirt } from "lucide-react";
import { toast } from "sonner";

import { JERSEY_TEMPLATES, getTemplate } from "@shared/jerseyTemplates";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import JerseyCanvas from "@/components/JerseyCanvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { getLoginUrl } from "@/const";

export default function MyDesigns() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  const utils = trpc.useUtils();
  const { data: jerseys, isLoading } = trpc.jersey.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const deleteMutation = trpc.jersey.delete.useMutation({
    onSuccess: () => {
      utils.jersey.list.invalidate();
      toast.success("Design deleted.");
    },
    onError: () => toast.error("Failed to delete design."),
  });

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-8 text-center">
        <Shirt size={48} className="text-gray-300" />
        <h2 className="text-xl font-semibold text-gray-700">Sign in to see your designs</h2>
        <p className="max-w-sm text-sm text-gray-500">
          Your saved jersey designs will appear here once you're logged in.
        </p>
        <Button asChild>
          <a href={getLoginUrl()}>Sign in</a>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b bg-white px-6 py-4 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-gray-900">My Designs</h1>
          <p className="text-sm text-gray-500">
            {jerseys?.length ?? 0} saved jersey{jerseys?.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => navigate("/configurator")}>
          <Plus size={16} className="mr-1" />
          New jersey
        </Button>
      </header>

      <main className="mx-auto max-w-6xl p-6">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-gray-200" />
            ))}
          </div>
        ) : jerseys && jerseys.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {jerseys.map(jersey => {
              const tpl = getTemplate(jersey.templateId) ?? JERSEY_TEMPLATES[0];
              const colors = jersey.colors as Record<string, string>;
              return (
                <Card key={jersey.id} className="group overflow-hidden">
                  <CardContent className="flex justify-center bg-gray-50 pt-4 pb-2">
                    <JerseyCanvas
                      template={tpl}
                      colors={colors}
                      playerName={jersey.playerName ?? ""}
                      playerNumber={jersey.playerNumber ?? ""}
                      teamName={jersey.teamName ?? ""}
                      textColor={jersey.textColor}
                      width={130}
                      height={162}
                    />
                  </CardContent>
                  <CardFooter className="flex flex-col items-start gap-2 px-3 py-2">
                    <p className="w-full truncate text-sm font-semibold text-gray-800">
                      {jersey.name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {tpl.name} ·{" "}
                      {new Date(jersey.updatedAt).toLocaleDateString()}
                    </p>
                    <div className="flex w-full gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => navigate(`/configurator/${jersey.id}`)}
                      >
                        <Pencil size={13} className="mr-1" />
                        Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700">
                            <Trash2 size={13} />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{jersey.name}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteMutation.mutate({ id: jersey.id })}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <Shirt size={56} className="text-gray-300" />
            <h2 className="text-lg font-semibold text-gray-600">No designs yet</h2>
            <p className="max-w-xs text-sm text-gray-400">
              Create your first jersey and it will appear here.
            </p>
            <Button onClick={() => navigate("/configurator")}>
              <Plus size={15} className="mr-1" />
              Create jersey
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

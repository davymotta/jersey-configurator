import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Configurator from "./pages/Configurator";
import MyDesigns from "./pages/MyDesigns";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/configurator" component={Configurator} />
      <Route path="/configurator/:id" component={Configurator} />
      <Route path="/my-designs" component={MyDesigns} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

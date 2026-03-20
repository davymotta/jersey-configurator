import { useLocation } from "wouter";
import { Shirt, Palette, Download, BookOpen } from "lucide-react";

import { JERSEY_TEMPLATES } from "@shared/jerseyTemplates";
import { useAuth } from "@/_core/hooks/useAuth";
import JerseyCanvas from "@/components/JerseyCanvas";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";

const FEATURE_LIST = [
  {
    icon: <Palette size={22} className="text-blue-500" />,
    title: "Full color control",
    desc: "Customize every zone — body, sleeves, collar — with any color you choose.",
  },
  {
    icon: <Shirt size={22} className="text-purple-500" />,
    title: "4 pro templates",
    desc: "Classic, Bicolor, Side Stripes, and Retro designs ready to personalize.",
  },
  {
    icon: <BookOpen size={22} className="text-green-500" />,
    title: "Names & numbers",
    desc: "Add player name, number, and team name with a single click.",
  },
  {
    icon: <Download size={22} className="text-orange-500" />,
    title: "Export print-ready SVG",
    desc: "Download a crisp SVG file ready for printing or sublimation.",
  },
];

export default function Home() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-2 font-bold text-gray-900">
          <Shirt size={22} className="text-blue-600" />
          Jersey Configurator
        </div>
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <Button variant="outline" onClick={() => navigate("/my-designs")}>
              My designs
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <a href={getLoginUrl()}>Sign in</a>
            </Button>
          )}
          <Button onClick={() => navigate("/configurator")}>
            Design a jersey
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto flex max-w-5xl flex-col items-center gap-10 px-6 py-20 text-center md:flex-row md:text-left">
        <div className="flex-1 space-y-5">
          <h1 className="text-4xl font-extrabold leading-tight text-gray-900 md:text-5xl">
            Design your perfect<br />
            <span className="text-blue-600">sports jersey</span>
          </h1>
          <p className="max-w-lg text-lg text-gray-500">
            Pick a template, pick your colors, add your team name and number —
            then export a print-ready SVG in seconds.
          </p>
          <div className="flex flex-wrap justify-center gap-3 md:justify-start">
            <Button size="lg" onClick={() => navigate("/configurator")}>
              Start designing — it's free
            </Button>
            {isAuthenticated && (
              <Button size="lg" variant="outline" onClick={() => navigate("/my-designs")}>
                My designs
              </Button>
            )}
          </div>
        </div>

        {/* Template previews */}
        <div className="flex gap-4 md:gap-6">
          {JERSEY_TEMPLATES.slice(0, 2).map(tpl => (
            <button
              key={tpl.id}
              onClick={() => navigate("/configurator")}
              className="rounded-2xl bg-gray-50 p-4 shadow-sm transition hover:shadow-md"
            >
              <JerseyCanvas
                template={tpl}
                colors={tpl.defaultColors}
                width={120}
                height={150}
              />
              <p className="mt-2 text-xs font-medium text-gray-500">{tpl.name}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-5xl px-6">
          <h2 className="mb-10 text-center text-2xl font-bold text-gray-800">
            Everything you need
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURE_LIST.map(f => (
              <div key={f.title} className="rounded-xl bg-white p-5 shadow-sm">
                <div className="mb-3">{f.icon}</div>
                <h3 className="mb-1 font-semibold text-gray-800">{f.title}</h3>
                <p className="text-sm text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* All templates preview */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="mb-8 text-center text-2xl font-bold text-gray-800">
          4 templates, endless combinations
        </h2>
        <div className="flex flex-wrap justify-center gap-8">
          {JERSEY_TEMPLATES.map(tpl => (
            <button
              key={tpl.id}
              onClick={() => navigate("/configurator")}
              className="group flex flex-col items-center gap-2 rounded-2xl p-4 transition hover:bg-gray-50"
            >
              <JerseyCanvas
                template={tpl}
                colors={tpl.defaultColors}
                teamName="TEAM"
                playerNumber="10"
                playerName="SMITH"
                width={140}
                height={175}
              />
              <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600">
                {tpl.name}
              </span>
              <span className="text-xs text-gray-400">{tpl.description}</span>
            </button>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Button size="lg" onClick={() => navigate("/configurator")}>
            Open the configurator
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t px-6 py-6 text-center text-xs text-gray-400">
        Jersey Configurator — design, customize, export.
      </footer>
    </div>
  );
}

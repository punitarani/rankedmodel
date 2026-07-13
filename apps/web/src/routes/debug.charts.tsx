import { createFileRoute } from '@tanstack/react-router'
import { CadenceBars } from '#/components/charts/cadence-bars'
import { InlineBar } from '#/components/charts/inline-bar'
import { Radar } from '#/components/charts/radar'
import { INDEX_Y_WINDOW } from '#/components/charts/scales'
import { QualityPriceScatter } from '#/components/charts/scatter'
import { Sparkline } from '#/components/charts/sparkline'

/** Eyeball gallery for the chart primitives (plan commit 18). */
export const Route = createFileRoute('/debug/charts')({
  component: ChartsGallery,
})

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-[10px] border border-border bg-card p-4">
    <div className="mb-2 text-[13px] font-semibold">{title}</div>
    {children}
  </div>
)

function ChartsGallery() {
  return (
    <div className="grid max-w-5xl grid-cols-1 gap-3.5 p-6 md:grid-cols-2">
      <Card title="Quality vs price (scatter)">
        <QualityPriceScatter
          points={[
            {
              slug: 'a',
              name: 'Frontier A',
              outputPrice: 75,
              index: 92,
              open: false,
              labeled: true,
            },
            { slug: 'b', name: 'Open B', outputPrice: 1.3, index: 84, open: true, labeled: true },
            { slug: 'c', name: 'Small C', outputPrice: 0.08, index: 46, open: true },
          ]}
          yWindow={INDEX_Y_WINDOW}
        />
      </Card>
      <Card title="Capability radar">
        <Radar
          series={[
            { values: [0.97, 0.89, 0.78, 0.84, 0.99, 0.87], color: 'var(--acc)' },
            { values: [0.9, 0.87, 0.75, 0.79, 0.97, 0.75], color: 'var(--open)' },
          ]}
        />
      </Card>
      <Card title="Family sparkline">
        <Sparkline
          dots={[
            { value: 62.9, label: 'v1 · 62.9' },
            { value: 76.7, label: 'v2 · 76.7' },
            { value: 84.7, label: 'v3 · 84.7', active: true },
            { value: 87.9, label: 'v4 · 87.9' },
          ]}
        />
      </Card>
      <Card title="Cadence + inline bars">
        <CadenceBars
          quarters={[
            { label: "'24 Q3", count: 2 },
            { label: "'24 Q4", count: 4 },
            { label: "'25 Q1", count: 7 },
            { label: "'25 Q2", count: 9 },
            { label: "'26 Q2", count: 11, latest: true },
          ]}
        />
        <div className="mt-4 flex flex-col gap-2">
          <InlineBar pct={92} />
          <InlineBar pct={64} color="var(--open)" />
          <InlineBar pct={31} color="var(--closed)" height={5} />
        </div>
      </Card>
    </div>
  )
}

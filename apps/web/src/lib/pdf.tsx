/* eslint-disable @next/next/no-img-element */
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { ScanRunDetail, SerializableFinding } from './queries';

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, color: '#0b0e14', fontFamily: 'Helvetica' },
  title: { fontSize: 18, color: '#10b981', marginBottom: 4 },
  subtitle: { fontSize: 9, color: '#475569', marginBottom: 16 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metaCell: { width: '48%', marginBottom: 6 },
  metaLabel: { fontSize: 7, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 },
  metaValue: { fontSize: 9, color: '#0b0e14', marginTop: 2 },
  sectionTitle: {
    fontSize: 11,
    color: '#0b0e14',
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#cbd5e1',
    paddingBottom: 2,
  },
  findingRow: {
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
  },
  findingHeader: { flexDirection: 'row', gap: 8, alignItems: 'baseline' },
  ruleId: { fontSize: 10, color: '#10b981', fontFamily: 'Courier' },
  badge: {
    fontSize: 7,
    color: '#0b0e14',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
  },
  badgeCritical: { backgroundColor: '#fee2e2', color: '#b91c1c' },
  badgeHigh: { backgroundColor: '#fef3c7', color: '#b45309' },
  badgeMedium: { backgroundColor: '#fef9c3', color: '#854d0e' },
  badgeLow: { backgroundColor: '#dcfce7', color: '#166534' },
  location: { fontSize: 9, color: '#1e293b', fontFamily: 'Courier' },
  message: { fontSize: 8, color: '#475569', marginTop: 2 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 32,
    right: 32,
    fontSize: 7,
    color: '#94a3b8',
    textAlign: 'center',
  },
});

const SEVERITY_ORDER: SerializableFinding['severity'][] = ['critical', 'high', 'medium', 'low'];

interface AiFixSummary {
  findingKey: string;
  costUsd: number;
}

export async function renderScanPdf(
  scan: ScanRunDetail,
  fixes: AiFixSummary[] = [],
): Promise<Uint8Array> {
  // @react-pdf/renderer's default Helvetica embed only carries a small
  // glyph subset; characters outside it (em-dash, middle-dot, ellipsis,
  // CJK, Cyrillic) crash the renderer with `Cannot read properties of
  // undefined (reading 'unitsPerEm')`. Normalise to ASCII before render
  // so any field — including future user-supplied filenames — is safe.
  const sanitised = asciiScan(scan);
  const buffer = await renderToBuffer(<ScanReportDocument scan={sanitised} fixes={fixes} />);
  return new Uint8Array(buffer);
}

function asciiScan(scan: ScanRunDetail): ScanRunDetail {
  return {
    ...scan,
    rootPath: toAscii(scan.rootPath),
    scannedAt: toAscii(scan.scannedAt),
    rulesVersion: toAscii(scan.rulesVersion),
    audithexVersion: toAscii(scan.audithexVersion),
    fingerprint: toAscii(scan.fingerprint),
    findings: scan.findings.map((f) => ({
      ...f,
      file: toAscii(f.file),
      messageKey: toAscii(f.messageKey),
      ...(f.cwe ? { cwe: toAscii(f.cwe) } : {}),
    })),
  };
}

function toAscii(input: string): string {
  // Replace common typographic chars with ASCII equivalents, then drop
  // anything else outside the printable ASCII range.
  return input
    .replace(/[‐-―]/g, '-')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[…]/g, '...')
    .replace(/[·•‧]/g, '|')
    .replace(/[ ]/g, ' ')
    .replace(/[^\x20-\x7E\t\n]/g, '?');
}

function ScanReportDocument({
  scan,
  fixes,
}: {
  scan: ScanRunDetail;
  fixes: AiFixSummary[];
}): ReactElement {
  const grouped = new Map<SerializableFinding['severity'], SerializableFinding[]>();
  for (const f of scan.findings) {
    const list = grouped.get(f.severity);
    if (list) list.push(f);
    else grouped.set(f.severity, [f]);
  }
  const totalCost = fixes.reduce((sum, f) => sum + f.costUsd, 0);
  const fixSet = new Set(fixes.map((f) => f.findingKey));

  return (
    <Document
      title={`Audithex scan ${scan.id}`}
      author="Audithex"
      subject={`Scan report for ${scan.rootPath}`}
    >
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Audithex - scan {scan.id.slice(0, 8)}...</Text>
        <Text style={styles.subtitle}>
          {scan.rootPath} -- scanned {scan.scannedAt}
        </Text>

        <View style={styles.metaGrid}>
          <MetaCell label="Project root" value={scan.rootPath} />
          <MetaCell label="Scanned at" value={scan.scannedAt} />
          <MetaCell label="Rules pack" value={scan.rulesVersion} />
          <MetaCell label="Audithex CLI" value={scan.audithexVersion} />
          <MetaCell label="Elapsed (ms)" value={String(scan.elapsedMs)} />
          <MetaCell
            label="Findings"
            value={`${scan.totalFindings} (C${scan.severityCounts.critical}/H${scan.severityCounts.high}/M${scan.severityCounts.medium}/L${scan.severityCounts.low})`}
          />
          <MetaCell
            label="Discovery"
            value={`${scan.discovery.totalFiles} files / ${scan.discovery.envFiles} env`}
          />
          <MetaCell label="AI fixes cached" value={`${fixes.length} ($${totalCost.toFixed(4)})`} />
        </View>

        {scan.findings.length === 0 ? (
          <Text style={styles.message}>This scan produced no findings.</Text>
        ) : (
          SEVERITY_ORDER.map((severity) => {
            const findings = grouped.get(severity);
            if (!findings || findings.length === 0) return null;
            return (
              <View key={severity}>
                <Text style={styles.sectionTitle}>
                  {severity.toUpperCase()} ({findings.length})
                </Text>
                {findings.map((f, index) => (
                  <View
                    key={`${f.ruleId}-${f.file}-${f.line}-${index}`}
                    style={styles.findingRow}
                    wrap={false}
                  >
                    <View style={styles.findingHeader}>
                      <Text style={styles.ruleId}>{f.ruleId}</Text>
                      <Text style={[styles.badge, severityStyle(severity)]}>
                        {severity.toUpperCase()}
                      </Text>
                      <Text style={styles.location}>
                        {f.file}:{f.line}
                      </Text>
                      {fixSet.has(`${f.ruleId}|${f.file}|${f.line}`) ? (
                        <Text style={[styles.badge, styles.badgeLow]}>AI FIX CACHED</Text>
                      ) : null}
                    </View>
                    <Text style={styles.message}>
                      {f.messageKey}
                      {f.owasp.length > 0 ? ` | OWASP ${f.owasp.join(', ')}` : ''}
                      {f.cwe ? ` | ${f.cwe}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })
        )}

        <Text style={styles.footer} fixed>
          Generated by Audithex | {new Date().toISOString().slice(0, 19)}Z | scan {scan.id}
        </Text>
      </Page>
    </Document>
  );
}

function MetaCell({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={styles.metaCell}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function severityStyle(severity: SerializableFinding['severity']) {
  switch (severity) {
    case 'critical':
      return styles.badgeCritical;
    case 'high':
      return styles.badgeHigh;
    case 'medium':
      return styles.badgeMedium;
    default:
      return styles.badgeLow;
  }
}

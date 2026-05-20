import { useAppState } from "../state/AppState.tsx";
import { Bullet, InfoRow, NoiseStrip, SectionLabel } from "../components/primitives.tsx";

export function About() {
  const { config, version } = useAppState();
  const deviceName = config?.device.name ?? "ndi-monitor-pi5";
  const host = config?.server.host ?? "0.0.0.0";
  const port = config?.server.port ?? 8080;
  const source = config?.receiver.sourceName || "not configured";

  return (
    <>
      <div>
        <SectionLabel right={`BUILD ${version} · AARCH64`}>SYSTEM</SectionLabel>
        <NoiseStrip
          className="noise-strip"
          tokens={[
            <span key="rpi">RPI · 5 · 8GB</span>,
            <span key="dot1" className="dot">·</span>,
            <span key="sdl">SDL2 · KMSDRM</span>,
            <span key="dot2" className="dot">·</span>,
            <span key="ndi">NDI v5.6</span>
          ]}
        />
        <div style={{ marginTop: 10 }}>
          <InfoRow label="DEVICE NAME" value={deviceName} lg />
          <InfoRow label="WEB UI BIND" value={`${host}:${port}`} />
          <InfoRow label="CONFIGURED SOURCE" value={source} />
          <InfoRow label="VIDEO PATH" value="SDL2 KMSDRM · HDMI-0" />
        </div>
      </div>

      <div>
        <SectionLabel right="5 ITEMS">RUNTIME PATHS</SectionLabel>
        <div style={{ marginTop: 10 }}>
          <InfoRow label="CONFIG" value="/etc/ndi-receiver/config.yaml" />
          <InfoRow label="STATUS SNAPSHOT" value="/var/lib/ndi-receiver/receiver-status.json" />
          <InfoRow label="WEB LOG" value="/var/log/ndi-receiver/web.log" />
          <InfoRow label="RECEIVER LOG" value="/var/log/ndi-receiver/receiver.log" />
          <InfoRow label="INSTALL ROOT" value="/opt/ndi-monitor" />
        </div>
      </div>

      <div>
        <SectionLabel right="HOW IT WORKS">ARCHITECTURE</SectionLabel>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <Bullet num="01" title="ndi-web.service" desc="Fastify control plane · REST · SSE · supervises child" />
          <Bullet num="02" title="apps/receiver (C++)" desc="NDI in · HDMI out via SDL2/KMS/DRM · no X11" />
          <Bullet num="03" title="discovery helper" desc="short-lived subprocess · never holds NDI handle" />
          <Bullet num="04" title="ndi-standby.service" desc="Boot screen with QR + URL on tty1" />
        </div>
      </div>

      <p className="note" style={{ marginTop: 4 }}>
        Designed for trusted LAN use · one stream at a time · no authentication layer · target OS: Raspberry Pi OS 64-bit (bookworm).
      </p>
    </>
  );
}

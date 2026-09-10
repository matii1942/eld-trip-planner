import { useEffect } from "react";
import {
  MapContainer,
  Marker,
  Polyline,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";
import L from "leaflet";

import { STOP_STYLE, dateTime, hours, miles } from "../lib/format";

/** Divs beat image sprites here: no asset pipeline, and they theme cleanly. */
const pinIcon = (kind) => {
  const s = STOP_STYLE[kind] || STOP_STYLE.break;
  const big = ["start", "pickup", "dropoff"].includes(kind);
  const size = big ? 30 : 24;
  return L.divIcon({
    className: "",
    html: `<div class="pin-marker" style="width:${size}px;height:${size}px;background:${s.bg};color:${s.color};font-size:${
      big ? 13 : 11
    }px;font-weight:700">${s.icon}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
};

function FitBounds({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (!coords?.length) return;
    map.fitBounds(L.latLngBounds(coords), { padding: [42, 42] });
  }, [coords, map]);
  return null;
}

export default function RouteMap({ plan }) {
  const coords = plan?.route?.coords || [];
  const stops = (plan?.stops || []).filter((s) => s.lat != null);
  const center = coords.length ? coords[Math.floor(coords.length / 2)] : [39.5, -98.35];

  return (
    <div className="map-wrap">
      <MapContainer center={center} zoom={4} scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* casing under the route so it reads on any basemap */}
        <Polyline positions={coords} pathOptions={{ color: "#ffffff", weight: 8, opacity: 0.9 }} />
        <Polyline positions={coords} pathOptions={{ color: "#1d4ed8", weight: 4, opacity: 0.95 }} />

        {stops.map((s, i) => (
          <Marker key={`${s.kind}-${i}`} position={[s.lat, s.lon]} icon={pinIcon(s.kind)}>
            <Popup>
              <div className="popup">
                <h4>{s.label}</h4>
                <div className="meta">
                  {s.location && <div>{s.location}</div>}
                  <div>
                    <b>{dateTime(s.arrive)}</b>
                    {s.hours > 0 && <> · {hours(s.hours)}</>}
                  </div>
                  <div>Mile {miles(s.odometer)}</div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        <FitBounds coords={coords} />
      </MapContainer>

      <div className="map-legend">
        {[
          ["start", "Start"],
          ["pickup", "Pickup (1 h)"],
          ["dropoff", "Dropoff (1 h)"],
          ["fuel", "Fuel (every 1,000 mi)"],
          ["break", "30-min break"],
          ["rest", "10-hr reset"],
          ["restart", "34-hr restart"],
        ].map(([k, label]) => {
          const s = STOP_STYLE[k];
          const n = stops.filter((x) => x.kind === k).length;
          if (!n) return null;
          return (
            <div className="li" key={k}>
              <span className="sw" style={{ background: s.bg, color: s.color }}>{s.icon}</span>
              {label}
              <b style={{ marginLeft: "auto", paddingLeft: 8 }}>{n}</b>
            </div>
          );
        })}
      </div>
    </div>
  );
}

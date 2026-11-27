-- Layout: datos del mapa de Port Solano (la misma ciudad que el juego original).
-- LayoutData lo genera roblox/tools/build-place.ts a partir de src/world/CityLayout.ts.
-- Coordenadas en studs (1 metro del juego original = SCALE studs).

local D = require(script.Parent:WaitForChild("LayoutData"))

local Layout = {}
local SC = D.SCALE
Layout.SCALE = SC
Layout.WATER_Y = D.WATER_Y * SC
Layout.SPAWN = Vector3.new(D.SPAWN.x, 2, D.SPAWN.z)

-- Colores para el nombre de cada distrito en el HUD (indices de District en el original)
local COLORS = {
	[0] = Color3.fromRGB(120, 190, 255), -- Downtown
	[1] = Color3.fromRGB(230, 220, 200), -- Midtown
	[2] = Color3.fromRGB(255, 215, 120), -- Bellavista
	[3] = Color3.fromRGB(90, 230, 220), -- Ocean Mile
	[4] = Color3.fromRGB(255, 225, 140), -- Sunreef Beach
	[5] = Color3.fromRGB(200, 230, 140), -- Palm Hollow
	[6] = Color3.fromRGB(220, 150, 120), -- Ironside
	[7] = Color3.fromRGB(255, 170, 80), -- Saltworks Port
	[8] = Color3.fromRGB(255, 120, 200), -- Galleria
	[9] = Color3.fromRGB(200, 210, 225), -- Aeropuerto
	[10] = Color3.fromRGB(190, 200, 120), -- Cypress Flats
	[11] = Color3.fromRGB(110, 220, 120), -- Mirador Park
	[12] = Color3.fromRGB(110, 180, 230), -- Rio Lento
	[13] = Color3.fromRGB(70, 150, 255), -- Atlantic Waters
	[14] = Color3.fromRGB(120, 200, 255), -- Vela Marina
	[15] = Color3.fromRGB(255, 210, 90), -- Coral Key
}

export type District = { name: string, color: Color3 }
local cache: { [number]: District } = {}
local function district(id: number): District
	local d = cache[id]
	if not d then
		d = { name = D.DISTRICT_NAMES[id] or "Port Solano", color = COLORS[id] or Color3.new(1, 1, 1) }
		cache[id] = d
	end
	return d
end

-- Indice del distrito (District del original) en una posicion (studs)
function Layout.districtIdAt(x: number, z: number): number
	local ci = math.floor((x / SC + D.HALF) / D.CELL)
	local cj = math.floor((z / SC + D.HALF) / D.CELL)
	if ci < 0 or cj < 0 or ci >= D.N or cj >= D.N then
		return 13
	end
	local idx = cj * D.N + ci + 1
	return tonumber(string.sub(D.GRID, idx, idx), 36) or 13
end

-- Distrito en una posicion (studs)
function Layout.districtAt(x: number, z: number): District
	local mx, mz = x / SC, z / SC
	local ci = math.floor((mx + D.HALF) / D.CELL)
	local cj = math.floor((mz + D.HALF) / D.CELL)
	if ci < 0 or cj < 0 or ci >= D.N or cj >= D.N then
		return district(13)
	end
	local idx = cj * D.N + ci + 1
	local id = tonumber(string.sub(D.GRID, idx, idx), 36) or 13
	return district(id)
end

-- Altura del terreno en METROS (copia de groundY del original, sin puentes)
local function smoothstep(a, b, v)
	local t = math.clamp((v - a) / (b - a), 0, 1)
	return t * t * (3 - 2 * t)
end
function Layout.groundMeters(x: number, z: number): number
	local isl = D.ISLAND
	if x > isl.x0 and x < isl.x1 and z > isl.z0 and z < isl.z1 then
		local e = math.min(x - isl.x0, isl.x1 - x, z - isl.z0, isl.z1 - z)
		return -6 + smoothstep(0, 22, e) * 6
	end
	local y = 0
	if x > 1150 then
		y = -smoothstep(1165, 1280, x) * 6
	end
	if z > D.RIVER_Z0 - 6 and z < D.RIVER_Z1 + 6 and x < 1250 then
		local e = math.min(z - (D.RIVER_Z0 - 6), D.RIVER_Z1 + 6 - z)
		y = math.min(y, -smoothstep(0, 12, e) * 5.5)
	end
	if math.abs(x) > D.HALF - 5 or math.abs(z) > D.HALF - 5 then
		y = math.min(y, -6)
	end
	return y
end
Layout.HALF_M = D.HALF

-- Destinos de los trabajos: los puntos de interes del juego original
export type Destination = { name: string, pos: Vector3 }
Layout.DESTINATIONS = {} :: { Destination }
for _, p in ipairs(D.POIS) do
	table.insert(Layout.DESTINATIONS, { name = p.name, pos = Vector3.new(p.x, 1, p.z) })
end

-- Objetos ocultos (mismas posiciones que los pickups del original)
Layout.SHELLS = {} :: { Vector3 }
Layout.SHELL_HINTS = {} :: { string }
for _, p in ipairs(D.PICKUPS) do
	table.insert(Layout.SHELLS, Vector3.new(p.x, 3, p.z))
	table.insert(Layout.SHELL_HINTS, p.hint)
end

-- Coches aparcados
Layout.CAR_SPOTS = {}
for _, c in ipairs(D.CARS) do
	table.insert(Layout.CAR_SPOTS, { pos = Vector3.new(c.x, 0.2, c.z), yaw = c.yaw })
end

-- Red de calles del original: tramos entre cruces (en metros) y grafo para el trafico
Layout.CELL_M = D.CELL
function Layout.lineCoord(i: number): number
	return -D.HALF + i * D.CELL
end
-- nodo (i, j) -> clave
local function key(i, j)
	return i * 64 + j
end
Layout.nodeKey = key
Layout.ROADS = {}
Layout.GRAPH = {} -- [clave] = { {to = clave, hw = mediaAnchura(m), hwy = bool}, ... }
local function link(a, b, hw, hwy)
	Layout.GRAPH[a] = Layout.GRAPH[a] or {}
	table.insert(Layout.GRAPH[a], { to = b, hw = hw, hwy = hwy })
end
for _, r in ipairs(D.ROADS) do
	local i, j, axis, hw, hwy, bridge, dirt = r[1], r[2], r[3], r[4], r[5] == 1, r[6] == 1, r[7] == 1
	local a = key(i, j)
	local b = if axis == 0 then key(i, j + 1) else key(i + 1, j)
	table.insert(Layout.ROADS, { a = a, b = b, i = i, j = j, axis = axis, hw = hw, hwy = hwy, bridge = bridge, dirt = dirt })
	link(a, b, hw, hwy)
	link(b, a, hw, hwy)
end
-- posicion de un nodo en studs
function Layout.nodePos(k: number): Vector3
	local i, j = k // 64, k % 64
	return Vector3.new(Layout.lineCoord(i) * SC, 0, Layout.lineCoord(j) * SC)
end
-- media anchura (m) de la calle mas ancha que pasa por un nodo
function Layout.nodeHalfWidth(k: number): number
	local m = 7
	for _, e in ipairs(Layout.GRAPH[k] or {}) do
		m = math.max(m, e.hw)
	end
	return m
end

-- Nombres de calles del HUD (streetName del original)
local AVENUES = { "Cypress", "Old Mill", "Juniper", "Farm Line", "Pelican", "Harvest", "Sawgrass", "Magnolia", "Orchid", "Larkspur",
	"Hibiscus", "Banyan", "Route 9", "Marigold", "Sable", "Coquina", "Verde", "Alhambra", "Sol", "Calle Ocho", "Mercer", "Delmar",
	"Biscayne Row", "Tidewater", "Corsair", "Seaview", "Aquila", "Ocean Drive", "Shoreline", "Coral Key", "Lagoon", "Reef", "Outer" }
local function ordinal(n)
	local v = n % 100
	local suf = if v >= 11 and v <= 13 then "th" elseif n % 10 == 1 then "st" elseif n % 10 == 2 then "nd" elseif n % 10 == 3 then "rd" else "th"
	return tostring(n) .. suf
end
function Layout.streetName(xs: number, zs: number): string
	local x, z = xs / SC, zs / SC
	local i = math.floor((x + D.HALF) / D.CELL + 0.5)
	local j = math.floor((z + D.HALF) / D.CELL + 0.5)
	local dx, dz = math.abs(x - Layout.lineCoord(i)), math.abs(z - Layout.lineCoord(j))
	local name = AVENUES[i + 1] or "Outer"
	local av = if i == 12 then name else name .. " Ave"
	local st = if j == 5 then "Bayshore Expwy" else ordinal(math.abs(j - 16) + 1) .. " St"
	if dx < dz then
		return if dz < 14 then av .. " & " .. st else av
	end
	return if dx < 14 then st .. " & " .. av else st
end

return Layout

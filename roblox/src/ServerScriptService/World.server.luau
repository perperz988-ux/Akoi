-- World: construye todo el mapa de Port Solano al arrancar el servidor
-- (suelo, mar, playa, calles, edificios, puerto, parque, isla, farolas)
-- y controla el ciclo de dia y noche.

local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

Players.CharacterAutoLoads = false -- esperamos a que el mapa exista

local Layout = require(ReplicatedStorage:WaitForChild("Layout"))

local rng = Random.new(2026)
local M = Enum.Material

local map = Instance.new("Folder")
map.Name = "PortSolano"
map.Parent = workspace

local function folder(name)
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = map
	return f
end

local fGround = folder("Suelo")
local fRoads = folder("Calles")
local fBuildings = folder("Edificios")
local fProps = folder("Decoracion")
local fLights = folder("Farolas")

local built = 0
local function block(parent, size, cf, color, material, props)
	local p = Instance.new("Part")
	p.Anchored = true
	p.Size = size
	p.CFrame = cf
	p.Color = color
	p.Material = material or M.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	if props then
		for k, v in pairs(props) do
			p[k] = v
		end
	end
	p.Parent = parent
	built += 1
	if built % 400 == 0 then
		task.wait()
	end
	return p
end

-- Caja apoyada en el suelo: centro (x, z), ancho w (X), fondo d (Z), desde y0 con altura h
local function box(parent, x, z, w, d, y0, h, color, material, props)
	return block(parent, Vector3.new(w, h, d), CFrame.new(x, y0 + h / 2, z), color, material, props)
end

local function wedge(parent, size, cf, color, material)
	local w = Instance.new("WedgePart")
	w.Anchored = true
	w.Size = size
	w.CFrame = cf
	w.Color = color
	w.Material = material or M.SmoothPlastic
	w.Parent = parent
	built += 1
	return w
end

local function cylinderUp(parent, pos, height, diameter, color, material)
	return block(
		parent,
		Vector3.new(height, diameter, diameter),
		CFrame.new(pos + Vector3.new(0, height / 2, 0)) * CFrame.Angles(0, 0, math.rad(90)),
		color,
		material,
		{ Shape = Enum.PartType.Cylinder }
	)
end

local function sign(part, face, text, textColor, bgColor)
	local gui = Instance.new("SurfaceGui")
	gui.Face = face
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 20
	gui.LightInfluence = 0
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundColor3 = bgColor or Color3.new(0, 0, 0)
	label.BackgroundTransparency = bgColor and 0 or 1
	label.TextColor3 = textColor
	label.TextScaled = true
	label.Font = Enum.Font.FredokaOne
	label.Text = text
	label.Parent = gui
	gui.Parent = part
end

----------------------------------------------------------------------
-- Iluminacion
----------------------------------------------------------------------
Lighting.Ambient = Color3.fromRGB(70, 70, 80)
Lighting.OutdoorAmbient = Color3.fromRGB(140, 130, 130)
Lighting.Brightness = 2.5
Lighting.ClockTime = 9
Lighting.GeographicLatitude = 25
Lighting.EnvironmentDiffuseScale = 0.5
Lighting.EnvironmentSpecularScale = 0.6

local atmosphere = Instance.new("Atmosphere")
atmosphere.Density = 0.28
atmosphere.Haze = 1.2
atmosphere.Color = Color3.fromRGB(255, 220, 200)
atmosphere.Decay = Color3.fromRGB(255, 140, 120)
atmosphere.Parent = Lighting

local bloom = Instance.new("BloomEffect")
bloom.Intensity = 0.6
bloom.Size = 30
bloom.Threshold = 1.6
bloom.Parent = Lighting

local cc = Instance.new("ColorCorrectionEffect")
cc.Saturation = 0.15
cc.Contrast = 0.08
cc.TintColor = Color3.fromRGB(255, 244, 232)
cc.Parent = Lighting

local rays = Instance.new("SunRaysEffect")
rays.Intensity = 0.06
rays.Parent = Lighting

----------------------------------------------------------------------
-- Mar (agua de Terrain) y fondo marino
----------------------------------------------------------------------
local terrain = workspace.Terrain
terrain.WaterColor = Color3.fromRGB(30, 170, 190)
terrain.WaterTransparency = 0.6
terrain.WaterReflectance = 0.6
terrain.WaterWaveSize = 0.2
terrain.WaterWaveSpeed = 8

terrain:FillBlock(CFrame.new(100, -45, 0), Vector3.new(1600, 10, 1400), M.Sand)
local WATER_TOP = Layout.WATER_Y
local waterH = WATER_TOP + 40
local wy = -40 + waterH / 2
terrain:FillBlock(CFrame.new(600, wy, 0), Vector3.new(600, waterH, 1400), M.Water) -- este
terrain:FillBlock(CFrame.new(-200, wy, -550), Vector3.new(1000, waterH, 300), M.Water) -- norte
terrain:FillBlock(CFrame.new(-200, wy, 590), Vector3.new(1000, waterH, 220), M.Water) -- sur
terrain:FillBlock(CFrame.new(-590, wy, 40), Vector3.new(220, waterH, 880), M.Water) -- oeste

----------------------------------------------------------------------
-- Tierra firme, playa e isla
----------------------------------------------------------------------
local GRASS = Color3.fromRGB(96, 158, 72)
local SAND = Color3.fromRGB(236, 214, 160)
local ASPHALT = Color3.fromRGB(48, 48, 54)
local SIDEWALK = Color3.fromRGB(196, 190, 180)

local landW = Layout.LAND_MAX_X - Layout.LAND_MIN_X
local landD = Layout.LAND_MAX_Z - Layout.LAND_MIN_Z
local landCX = (Layout.LAND_MAX_X + Layout.LAND_MIN_X) / 2
local landCZ = (Layout.LAND_MAX_Z + Layout.LAND_MIN_Z) / 2
box(fGround, landCX, landCZ, landW, landD, -40, 40, GRASS, M.Grass)

-- Playa Sunreef: losa de arena inclinada 3 grados que se mete en el mar
local slope = math.rad(3)
block(
	fGround,
	Vector3.new(144, 4, landD),
	CFrame.new(368, -3.46 - 2 / math.cos(slope), landCZ) * CFrame.Angles(0, 0, -slope),
	SAND,
	M.Sand
)

-- Isla Coral Key
local isl = Layout.ISLAND
local islCX, islCZ = (isl.minX + isl.maxX) / 2, (isl.minZ + isl.maxZ) / 2
local islW, islD = isl.maxX - isl.minX, isl.maxZ - isl.minZ
box(fGround, islCX, islCZ, islW + 40, islD + 40, -40, 39.6, SAND, M.Sand)
box(fGround, islCX, islCZ, islW, islD, -40, 40, GRASS, M.Grass)

----------------------------------------------------------------------
-- Calles
----------------------------------------------------------------------
local RW = Layout.ROAD_WIDTH
local DASH = Color3.fromRGB(240, 200, 60)

local function isNearRoad(v, list)
	for _, r in ipairs(list) do
		if math.abs(v - r) < RW / 2 + 1 then
			return true
		end
	end
	return false
end

for _, x in ipairs(Layout.ROADS_X) do
	box(fRoads, x, landCZ, RW, landD, -0.2, 0.4, ASPHALT, M.Asphalt)
	for z = Layout.LAND_MIN_Z + 10, Layout.LAND_MAX_Z - 10, 20 do
		if not isNearRoad(z, Layout.ROADS_Z) then
			box(fRoads, x, z, 0.6, 8, 0.2, 0.05, DASH, M.SmoothPlastic, { CanCollide = false })
		end
	end
end
for _, z in ipairs(Layout.ROADS_Z) do
	box(fRoads, landCX, z, landW, RW, -0.2, 0.42, ASPHALT, M.Asphalt)
	for x = Layout.LAND_MIN_X + 10, Layout.LAND_MAX_X - 10, 20 do
		if not isNearRoad(x, Layout.ROADS_X) then
			box(fRoads, x, z, 8, 0.6, 0.22, 0.05, DASH, M.SmoothPlastic, { CanCollide = false })
		end
	end
end

-- Puente a Coral Key
local BZ = Layout.BRIDGE_Z
local bridgeX0, bridgeX1 = 292, isl.minX + 10
local bridgeLen = bridgeX1 - bridgeX0
local bridgeCX = (bridgeX0 + bridgeX1) / 2
box(fRoads, bridgeCX, BZ, bridgeLen, RW + 4, -1.6, 1.8, Color3.fromRGB(150, 150, 155), M.Concrete)
box(fRoads, bridgeCX, BZ, bridgeLen, RW - 4, 0.2, 0.05, ASPHALT, M.Asphalt)
for side = -1, 1, 2 do
	box(fRoads, bridgeCX, BZ + side * (RW / 2 + 1.5), bridgeLen, 1, 0.2, 3, Color3.fromRGB(235, 235, 240), M.Concrete)
end
for x = bridgeX0 + 40, bridgeX1 - 20, 40 do
	box(fRoads, x, BZ, 6, 6, -40, 38.4, Color3.fromRGB(140, 140, 145), M.Concrete)
end

-- Calle de la isla
box(fRoads, islCX, BZ, islW - 10, RW, -0.2, 0.4, ASPHALT, M.Asphalt)
box(fRoads, islCX + 15, islCZ, RW, islD - 20, -0.2, 0.42, ASPHALT, M.Asphalt)

----------------------------------------------------------------------
-- Farolas
----------------------------------------------------------------------
local lamps = {}
local function streetLight(pos, facing)
	local pole = Color3.fromRGB(60, 60, 66)
	box(fLights, pos.X, pos.Z, 0.6, 0.6, 0, 14, pole, M.Metal)
	local arm = block(fLights, Vector3.new(0.4, 0.4, 4), CFrame.lookAt(pos + Vector3.new(0, 14, 0), pos + Vector3.new(0, 14, 0) + facing) * CFrame.new(0, 0, -2), pole, M.Metal)
	local lamp = block(fLights, Vector3.new(1.4, 0.5, 1.4), arm.CFrame * CFrame.new(0, -0.4, -2), Color3.fromRGB(255, 230, 170), M.SmoothPlastic, { CanCollide = false })
	local light = Instance.new("PointLight")
	light.Range = 36
	light.Brightness = 1.6
	light.Color = Color3.fromRGB(255, 210, 150)
	light.Enabled = false
	light.Parent = lamp
	table.insert(lamps, lamp)
end

for _, x in ipairs(Layout.ROADS_X) do
	local i = 0
	for z = Layout.LAND_MIN_Z + 40, Layout.LAND_MAX_Z - 20, 80 do
		if not isNearRoad(z, Layout.ROADS_Z) then
			i += 1
			local side = if i % 2 == 0 then 1 else -1
			streetLight(Vector3.new(x + side * (RW / 2 + 1.5), 0.3, z), Vector3.new(-side, 0, 0))
		end
	end
end
for _, z in ipairs(Layout.ROADS_Z) do
	local i = 0
	for x = Layout.LAND_MIN_X + 40, Layout.LAND_MAX_X - 20, 80 do
		if not isNearRoad(x, Layout.ROADS_X) then
			i += 1
			local side = if i % 2 == 0 then 1 else -1
			streetLight(Vector3.new(x, 0.3, z + side * (RW / 2 + 1.5)), Vector3.new(0, 0, -side))
		end
	end
end
for x = bridgeX0 + 20, bridgeX1 - 10, 60 do
	streetLight(Vector3.new(x, 0.2, BZ + RW / 2 - 1), Vector3.new(0, 0, -1))
end

----------------------------------------------------------------------
-- Decoracion reutilizable
----------------------------------------------------------------------
local LEAF = Color3.fromRGB(56, 140, 60)
local TRUNK = Color3.fromRGB(130, 95, 60)

local function palm(pos)
	local h = rng:NextNumber(14, 22)
	cylinderUp(fProps, pos, h, 1.4, TRUNK, M.Wood)
	local top = pos + Vector3.new(0, h, 0)
	for i = 1, 7 do
		local a = math.rad(i * (360 / 7) + rng:NextNumber(-10, 10))
		block(
			fProps,
			Vector3.new(2.4, 0.3, 9),
			CFrame.new(top) * CFrame.Angles(0, a, 0) * CFrame.new(0, -0.6, -4) * CFrame.Angles(math.rad(-22), 0, 0),
			LEAF,
			M.Grass,
			{ CanCollide = false }
		)
	end
	block(fProps, Vector3.new(1.6, 1.6, 1.6), CFrame.new(top - Vector3.new(0, 0.6, 0)), Color3.fromRGB(110, 80, 40), M.Wood, { Shape = Enum.PartType.Ball, CanCollide = false })
end

local function tree(pos)
	local h = rng:NextNumber(6, 10)
	cylinderUp(fProps, pos, h, 1.6, TRUNK, M.Wood)
	local s = rng:NextNumber(10, 15)
	block(fProps, Vector3.new(s, s, s), CFrame.new(pos + Vector3.new(0, h + s / 3, 0)), LEAF:Lerp(Color3.fromRGB(90, 170, 70), rng:NextNumber()), M.Grass, { Shape = Enum.PartType.Ball })
end

local function bench(pos, yaw)
	local cf = CFrame.new(pos) * CFrame.Angles(0, math.rad(yaw), 0)
	block(fProps, Vector3.new(6, 0.4, 2), cf * CFrame.new(0, 1.6, 0), Color3.fromRGB(150, 100, 60), M.Wood)
	block(fProps, Vector3.new(6, 1.6, 0.3), cf * CFrame.new(0, 2.6, 0.9), Color3.fromRGB(150, 100, 60), M.Wood)
	block(fProps, Vector3.new(0.4, 1.4, 1.8), cf * CFrame.new(-2.6, 0.7, 0), Color3.fromRGB(50, 50, 50), M.Metal)
	block(fProps, Vector3.new(0.4, 1.4, 1.8), cf * CFrame.new(2.6, 0.7, 0), Color3.fromRGB(50, 50, 50), M.Metal)
end

local function umbrella(pos, color)
	cylinderUp(fProps, pos, 7, 0.3, Color3.fromRGB(240, 240, 240), M.SmoothPlastic)
	block(fProps, Vector3.new(0.6, 8, 8), CFrame.new(pos + Vector3.new(0, 7, 0)) * CFrame.Angles(0, 0, math.rad(90)), color, M.Fabric, { Shape = Enum.PartType.Cylinder, CanCollide = false })
	block(fProps, Vector3.new(3, 0.1, 6), CFrame.new(pos + Vector3.new(2.5, 0.1, 0)), color:Lerp(Color3.new(1, 1, 1), 0.4), M.Fabric, { CanCollide = false })
end

----------------------------------------------------------------------
-- Edificios por distrito
----------------------------------------------------------------------
local GLASS = {
	Color3.fromRGB(110, 160, 200),
	Color3.fromRGB(80, 120, 160),
	Color3.fromRGB(150, 190, 210),
	Color3.fromRGB(90, 140, 140),
	Color3.fromRGB(170, 160, 200),
}
local PASTEL = {
	Color3.fromRGB(255, 210, 200),
	Color3.fromRGB(255, 240, 190),
	Color3.fromRGB(200, 235, 230),
	Color3.fromRGB(230, 210, 240),
	Color3.fromRGB(250, 250, 245),
	Color3.fromRGB(200, 225, 255),
}
local BRICK = {
	Color3.fromRGB(150, 80, 60),
	Color3.fromRGB(120, 90, 80),
	Color3.fromRGB(170, 120, 90),
	Color3.fromRGB(100, 100, 110),
}
local CONTAINER = {
	Color3.fromRGB(200, 60, 50),
	Color3.fromRGB(40, 110, 180),
	Color3.fromRGB(230, 160, 40),
	Color3.fromRGB(60, 150, 80),
	Color3.fromRGB(220, 220, 220),
	Color3.fromRGB(120, 60, 130),
}
local function pick(list)
	return list[rng:NextInteger(1, #list)]
end

local function tower(x, z, w, d, h)
	local color = pick(GLASS)
	box(fBuildings, x, z, w, d, 0.3, h, color, M.Glass, { Reflectance = 0.15 })
	local frame = color:Lerp(Color3.new(0.15, 0.15, 0.18), 0.6)
	for y = 12, h - 4, 12 do
		box(fBuildings, x, z, w + 0.4, d + 0.4, y, 1, frame, M.Concrete)
	end
	box(fBuildings, x, z, w + 1, d + 1, h + 0.3, 2, frame, M.Concrete)
	if h > 150 then
		box(fBuildings, x, z, 1, 1, h + 2.3, 24, Color3.fromRGB(200, 200, 200), M.Metal)
		box(fBuildings, x, z, 1.4, 1.4, h + 26, 1.4, Color3.fromRGB(255, 40, 40), M.Neon)
	end
end

local function house(x, z, yaw)
	local w, d, h = rng:NextNumber(20, 26), rng:NextNumber(16, 20), rng:NextNumber(10, 13)
	local cf = CFrame.new(x, 0.35, z) * CFrame.Angles(0, math.rad(yaw), 0)
	local wall = pick(PASTEL)
	block(fBuildings, Vector3.new(w, h, d), cf * CFrame.new(0, h / 2, 0), wall, M.Plaster)
	local roofColor = pick({ Color3.fromRGB(180, 90, 60), Color3.fromRGB(90, 90, 100), Color3.fromRGB(150, 110, 80) })
	local rh = 5
	-- dos cunas forman un tejado a dos aguas (la parte alta del WedgePart esta en +Z)
	wedge(fBuildings, Vector3.new(w + 1, rh, d / 2 + 0.5), cf * CFrame.new(0, h + rh / 2, -d / 4 - 0.25), roofColor, M.Slate)
	wedge(fBuildings, Vector3.new(w + 1, rh, d / 2 + 0.5), cf * CFrame.new(0, h + rh / 2, d / 4 + 0.25) * CFrame.Angles(0, math.pi, 0), roofColor, M.Slate)
	-- puerta y ventanas (mirando a -Z local)
	block(fBuildings, Vector3.new(3.5, 7, 0.3), cf * CFrame.new(0, 3.5, -d / 2 - 0.1), Color3.fromRGB(120, 80, 50), M.Wood)
	for _, ox in ipairs({ -w / 2 + 4, w / 2 - 4 }) do
		block(fBuildings, Vector3.new(4, 3.5, 0.3), cf * CFrame.new(ox, 6, -d / 2 - 0.1), Color3.fromRGB(160, 210, 240), M.Glass)
	end
	-- garaje/coche del vecino no; un buzon
	block(fProps, Vector3.new(1, 3.5, 1), cf * CFrame.new(w / 2 - 1, 1.75, -d / 2 - 8), Color3.fromRGB(60, 60, 200), M.Metal)
end

local function hotel(x, z, w, d, h)
	local color = pick(PASTEL)
	box(fBuildings, x, z, w, d, 0.3, h, color, M.Concrete)
	for y = 10, h - 4, 10 do
		box(fBuildings, x, z, w + 3, d + 3, y, 0.8, Color3.fromRGB(250, 250, 250), M.Concrete)
		box(fBuildings, x, z, w + 0.2, d + 0.2, y + 2, 5, Color3.fromRGB(120, 190, 220), M.Glass, { Transparency = 0.1 })
	end
	box(fBuildings, x, z, w + 2, d + 2, h + 0.3, 1.5, Color3.fromRGB(255, 255, 255), M.Concrete)
end

local function lowBuilding(x, z, w, d, h, label)
	local color = pick(BRICK)
	local b = box(fBuildings, x, z, w, d, 0.3, h, color, M.Brick)
	box(fBuildings, x, z, w + 0.6, d + 0.6, h + 0.3, 1.2, color:Lerp(Color3.new(0, 0, 0), 0.3), M.Concrete)
	-- escaparate
	box(fBuildings, x, z - d / 2 - 0.15, w - 4, 0.3, 0.6, 7, Color3.fromRGB(120, 160, 180), M.Glass)
	if label then
		local s = box(fBuildings, x, z - d / 2 - 0.4, w - 4, 0.4, 8.5, 3.5, Color3.fromRGB(20, 20, 20), M.SmoothPlastic)
		sign(s, Enum.NormalId.Front, label, pick({ Color3.fromRGB(255, 90, 180), Color3.fromRGB(90, 230, 255), Color3.fromRGB(255, 220, 80) }))
	end
	return b
end

local function container(x, y, z, yaw)
	block(fBuildings, Vector3.new(8, 8.5, 20), CFrame.new(x, y + 4.25, z) * CFrame.Angles(0, math.rad(yaw), 0), pick(CONTAINER), M.CorrodedMetal)
end

local function crane(x)
	local yellow = Color3.fromRGB(230, 180, 30)
	for _, ox in ipairs({ -10, 10 }) do
		for _, z in ipairs({ -392, -412 }) do
			box(fBuildings, x + ox, z, 2, 2, -10, 70, yellow, M.Metal)
		end
	end
	box(fBuildings, x, -402, 24, 24, 58, 3, yellow, M.Metal)
	box(fBuildings, x, -420, 4, 90, 56, 3, yellow, M.Metal)
	box(fBuildings, x, -402, 8, 8, 61, 6, Color3.fromRGB(240, 240, 240), M.Metal)
end

-- Rellena una manzana segun su distrito
local function fillCell(x0, x1, z0, z1)
	local w, d = x1 - x0, z1 - z0
	if w < 30 or d < 20 then
		return
	end
	local cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
	local key = Layout.districtKeyAt(cx, cz)
	local isPlaza = math.abs(cx - Layout.SPAWN.X) < 1 and math.abs(cz - Layout.SPAWN.Z) < 1

	-- acera
	box(fGround, cx, cz, w, d, -0.2, 0.5, SIDEWALK, M.Concrete)
	local m = 6
	local ix0, ix1, iz0, iz1 = x0 + m, x1 - m, z0 + m, z1 - m
	local iw, id = ix1 - ix0, iz1 - iz0

	local small = id < 50 or iw < 30

	if small and not isPlaza then
		local paved = key == "Port" or key == "Galleria" or key == "OceanMile"
		box(fGround, cx, cz, iw, id, 0, 0.35, if paved then Color3.fromRGB(150, 148, 140) else GRASS, if paved then M.Concrete else M.Grass)
		if not paved then
			for px = ix0 + 6, ix1 - 6, 30 do
				palm(Vector3.new(px, 0.35, cz))
			end
		end
	elseif isPlaza then
		-- Plaza Solano: fuente, bancos y palmeras (punto de aparicion)
		box(fGround, cx, cz, iw, id, 0, 0.35, Color3.fromRGB(225, 200, 170), M.Pavement)
		cylinderUp(fProps, Vector3.new(cx, 0.35, cz + 25), 1.6, 22, Color3.fromRGB(230, 230, 230), M.Marble)
		cylinderUp(fProps, Vector3.new(cx, 0.4, cz + 25), 1.7, 19, Color3.fromRGB(60, 170, 220), M.Glass)
		cylinderUp(fProps, Vector3.new(cx, 0.4, cz + 25), 7, 2, Color3.fromRGB(230, 230, 230), M.Marble)
		for i = 0, 3 do
			local a = math.rad(i * 90 + 45)
			palm(Vector3.new(cx + math.cos(a) * 42, 0.35, cz + math.sin(a) * 42))
			bench(Vector3.new(cx + math.cos(a) * 18, 0.35, cz - 10 + math.sin(a) * 12), i * 90)
		end
		local spawn = Instance.new("SpawnLocation")
		spawn.Anchored = true
		spawn.Size = Vector3.new(10, 0.4, 10)
		spawn.CFrame = CFrame.new(cx, 0.55, cz - 10)
		spawn.Color = Color3.fromRGB(255, 200, 80)
		spawn.Material = M.Neon
		spawn.Transparency = 0.4
		spawn.CanCollide = true
		spawn.Duration = 3
		spawn.Parent = map
		local sp = box(fProps, cx, cz + 50, 40, 1, 0.35, 8, Color3.fromRGB(30, 30, 40), M.SmoothPlastic)
		sign(sp, Enum.NormalId.Back, "PORT SOLANO", Color3.fromRGB(255, 200, 80))
		sign(sp, Enum.NormalId.Front, "PORT SOLANO", Color3.fromRGB(255, 200, 80))
	elseif key == "Downtown" then
		local hw, hd = iw / 2, id / 2
		for qx = 0, 1 do
			for qz = 0, 1 do
				local tx = ix0 + hw * (qx + 0.5)
				local tz = iz0 + hd * (qz + 0.5)
				tower(tx, tz, hw - rng:NextNumber(6, 14), hd - rng:NextNumber(6, 14), rng:NextNumber(70, 230))
			end
		end
	elseif key == "Galleria" then
		if cx < 0 then
			local mall = box(fBuildings, cx, cz, iw - 10, id - 16, 0.3, 26, Color3.fromRGB(245, 235, 225), M.Concrete)
			box(fBuildings, cx, cz, iw - 6, id - 12, 26.3, 2, Color3.fromRGB(255, 120, 200), M.Neon)
			box(fBuildings, cx, cz + (id - 16) / 2 + 0.2, 30, 0.4, 0.3, 12, Color3.fromRGB(120, 180, 220), M.Glass)
			local s = box(fBuildings, cx, cz + (id - 16) / 2 + 0.4, 50, 0.4, 15, 8, Color3.fromRGB(30, 30, 30), M.SmoothPlastic)
			sign(s, Enum.NormalId.Back, "GALLERIA", Color3.fromRGB(255, 120, 200))
			sign(mall, Enum.NormalId.Top, "GALLERIA", Color3.fromRGB(255, 120, 200))
		else
			box(fGround, cx, cz, iw, id, 0, 0.32, Color3.fromRGB(60, 60, 66), M.Asphalt)
			for px = ix0 + 6, ix1 - 6, 12 do
				box(fGround, px, cz, 0.5, id - 10, 0.32, 0.04, Color3.fromRGB(240, 240, 240), M.SmoothPlastic, { CanCollide = false })
			end
		end
	elseif key == "Port" then
		box(fGround, cx, cz, iw, id, 0, 0.33, Color3.fromRGB(140, 140, 135), M.Concrete)
		for px = ix0 + 8, ix1 - 8, 14 do
			for pz = iz0 + 14, iz1 - 14, 30 do
				if rng:NextNumber() < 0.8 then
					local stack = rng:NextInteger(1, 3)
					for s = 0, stack - 1 do
						container(px, 0.33 + s * 8.5, pz, 0)
					end
				end
			end
		end
	elseif key == "Park" then
		box(fGround, cx, cz, iw, id, 0, 0.35, GRASS:Lerp(Color3.fromRGB(120, 190, 90), 0.4), M.Grass)
		box(fGround, cx, cz, iw, 6, 0, 0.36, Color3.fromRGB(210, 190, 150), M.Ground)
		if w > 80 and rng:NextNumber() < 0.6 then
			cylinderUp(fProps, Vector3.new(cx + 20, 0, cz + 22), 0.42, 30, Color3.fromRGB(60, 140, 200), M.Glass)
		end
		for _ = 1, math.floor(iw * id / 900) do
			local tx, tz = rng:NextNumber(ix0 + 4, ix1 - 4), rng:NextNumber(iz0 + 4, iz1 - 4)
			if math.abs(tz - cz) > 6 then
				tree(Vector3.new(tx, 0.35, tz))
			end
		end
		bench(Vector3.new(cx - 15, 0.36, cz + 5), 180)
		bench(Vector3.new(cx + 15, 0.36, cz - 5), 0)
	elseif key == "Suburbs" then
		box(fGround, cx, cz, iw, id, 0, 0.35, GRASS, M.Grass)
		local cols = if iw > 70 then 2 else 1
		local rows = if id > 70 then 2 else 1
		for qx = 0, cols - 1 do
			for qz = 0, rows - 1 do
				local hx = ix0 + iw / cols * (qx + 0.5)
				local hz = iz0 + id / rows * (qz + 0.5)
				local yaw = if qz == 0 then 180 else 0
				house(hx, hz, yaw)
				palm(Vector3.new(hx + 14, 0.35, hz + (if qz == 0 then -14 else 14)))
			end
		end
	elseif key == "Ironside" then
		local labels = { "TACOS", "TALLER", "BODEGA", "BARBERIA", "PIZZA", "LAVANDERIA", nil, nil }
		local n = math.max(1, math.floor(iw / 34))
		local bw = iw / n
		for i = 0, n - 1 do
			for _, row in ipairs({ iz0 + 12, iz1 - 12 }) do
				local bd = math.min(22, id / 2 - 4)
				lowBuilding(ix0 + bw * (i + 0.5), row, bw - 4, bd, rng:NextNumber(14, 40), labels[rng:NextInteger(1, #labels)])
			end
		end
	elseif key == "OceanMile" then
		box(fGround, cx, cz, iw, id, 0, 0.35, Color3.fromRGB(235, 225, 200), M.Pavement)
		hotel(cx - 10, cz, iw - 40, id - 30, rng:NextNumber(50, 130))
		box(fGround, cx + iw / 2 - 12, cz, 14, id - 40, 0.35, 0.3, Color3.fromRGB(60, 200, 230), M.Glass, { Transparency = 0.2 })
		for pz = iz0 + 6, iz1 - 6, 18 do
			palm(Vector3.new(ix1 - 2, 0.35, pz))
		end
	else
		box(fGround, cx, cz, iw, id, 0, 0.35, GRASS, M.Grass)
		for _ = 1, math.floor(iw * id / 1500) do
			palm(Vector3.new(rng:NextNumber(ix0, ix1), 0.35, rng:NextNumber(iz0, iz1)))
		end
	end
end

local function edges(list, minV, maxV)
	local out = {}
	local prev = minV
	for _, r in ipairs(list) do
		table.insert(out, { prev, r - RW / 2 })
		prev = r + RW / 2
	end
	table.insert(out, { prev, maxV })
	return out
end

for _, ex in ipairs(edges(Layout.ROADS_X, Layout.LAND_MIN_X, Layout.LAND_MAX_X)) do
	for _, ez in ipairs(edges(Layout.ROADS_Z, Layout.LAND_MIN_Z, Layout.LAND_MAX_Z)) do
		fillCell(ex[1], ex[2], ez[1], ez[2])
	end
end

----------------------------------------------------------------------
-- Muelles y gruas del puerto
----------------------------------------------------------------------
local WOOD = Color3.fromRGB(140, 105, 70)
box(fGround, -320, -420, 320, 40, -1, 1.3, WOOD, M.WoodPlanks)
for x = -470, -170, 20 do
	for _, z in ipairs({ -405, -435 }) do
		box(fGround, x, z, 1.6, 1.6, -40, 39, Color3.fromRGB(90, 70, 50), M.Wood)
	end
end
crane(-400)
crane(-250)
-- barco carguero amarrado
box(fBuildings, -320, -470, 140, 24, -8, 12, Color3.fromRGB(150, 40, 40), M.Metal)
box(fBuildings, -320, -470, 140, 24, 4, 1, Color3.fromRGB(80, 80, 80), M.Metal)
box(fBuildings, -380, -470, 18, 20, 5, 14, Color3.fromRGB(240, 240, 240), M.Metal)
for x = -350, -260, 22 do
	container(x, 5, -470, 90)
end

----------------------------------------------------------------------
-- Playa Sunreef
----------------------------------------------------------------------
local UMBRELLA = { Color3.fromRGB(255, 90, 90), Color3.fromRGB(255, 200, 60), Color3.fromRGB(80, 180, 255), Color3.fromRGB(120, 230, 140) }
for z = Layout.LAND_MIN_Z + 20, Layout.LAND_MAX_Z - 20, 26 do
	if math.abs(z - BZ) > 24 and math.abs(z - 300) > 16 then
		local px = rng:NextNumber(302, 310)
		palm(Vector3.new(px, Layout.beachY(px) - 0.3, z))
		if rng:NextNumber() < 0.7 then
			local ux = rng:NextNumber(316, 330)
			umbrella(Vector3.new(ux, Layout.beachY(ux) - 0.2, z + rng:NextNumber(-6, 6)), pick(UMBRELLA))
		end
	end
end
-- Chiringuito
do
	local x, z = 318, 300
	local y = Layout.beachY(x + 6)
	box(fBuildings, x, z, 14, 12, y - 1, 1.6, WOOD, M.WoodPlanks)
	for _, o in ipairs({ { -6, -5 }, { 6, -5 }, { -6, 5 }, { 6, 5 } }) do
		box(fBuildings, x + o[1], z + o[2], 0.8, 0.8, y, 9, WOOD, M.Wood)
	end
	box(fBuildings, x, z, 17, 15, y + 9, 1.2, Color3.fromRGB(210, 180, 110), M.Fabric)
	local bar = box(fBuildings, x, z - 4, 10, 2, y + 0.6, 3.5, Color3.fromRGB(110, 80, 50), M.Wood)
	sign(bar, Enum.NormalId.Front, "CHIRINGUITO", Color3.fromRGB(255, 240, 120))
end
-- Torre de socorrista
do
	local x, z = 324, -250
	local y = Layout.beachY(x)
	for _, o in ipairs({ { -2, -2 }, { 2, -2 }, { -2, 2 }, { 2, 2 } }) do
		box(fBuildings, x + o[1], z + o[2], 0.6, 0.6, y - 0.5, 8, Color3.fromRGB(240, 240, 240), M.Wood)
	end
	box(fBuildings, x, z, 6, 6, y + 7.5, 0.6, Color3.fromRGB(240, 240, 240), M.Wood)
	box(fBuildings, x, z, 6, 6, y + 8.1, 4, Color3.fromRGB(230, 70, 60), M.Wood)
end

----------------------------------------------------------------------
-- Coral Key: mansiones
----------------------------------------------------------------------
local function mansion(x, z)
	box(fGround, x, z, 56, 46, 0, 0.3, Color3.fromRGB(235, 230, 220), M.Pavement)
	box(fBuildings, x, z + 6, 40, 26, 0.3, 12, Color3.fromRGB(250, 250, 248), M.Plaster)
	box(fBuildings, x + 6, z + 8, 26, 20, 12.3, 10, Color3.fromRGB(250, 250, 248), M.Plaster)
	box(fBuildings, x, z + 6, 42, 28, 12.3, 0.6, Color3.fromRGB(60, 60, 64), M.Concrete)
	box(fBuildings, x + 6, z + 8, 28, 22, 22.3, 0.6, Color3.fromRGB(60, 60, 64), M.Concrete)
	box(fBuildings, x, z - 7.1, 30, 0.3, 1, 9, Color3.fromRGB(120, 180, 220), M.Glass)
	box(fGround, x, z - 15, 26, 10, 0.3, 0.3, Color3.fromRGB(40, 200, 230), M.Glass, { Transparency = 0.2 })
	palm(Vector3.new(x - 24, 0.3, z - 18))
	palm(Vector3.new(x + 24, 0.3, z - 18))
end
mansion(580, -120)
mansion(580, 10)
mansion(690, -125)
mansion(695, 15)
for _ = 1, 22 do
	local a = rng:NextNumber(0, math.pi * 2)
	local px = islCX + math.cos(a) * (islW / 2 + 8)
	local pz = islCZ + math.sin(a) * (islD / 2 + 8)
	palm(Vector3.new(px, -0.4, pz))
end
do
	local s = box(fProps, isl.minX + 6, BZ - 20, 1, 6, 0.3, 4, Color3.fromRGB(255, 255, 255), M.Wood)
	sign(s, Enum.NormalId.Left, "CORAL KEY", Color3.fromRGB(30, 120, 160))
end

----------------------------------------------------------------------
-- Listo: deja entrar a los jugadores
----------------------------------------------------------------------
print(("[Port Solano] Mapa construido: %d piezas"):format(built))
workspace:SetAttribute("MapReady", true)
Players.CharacterAutoLoads = true
for _, plr in ipairs(Players:GetPlayers()) do
	if not plr.Character then
		task.spawn(function()
			plr:LoadCharacter()
		end)
	end
end
Players.PlayerAdded:Connect(function(plr)
	if not plr.Character then
		task.defer(function()
			if not plr.Character then
				plr:LoadCharacter()
			end
		end)
	end
end)

----------------------------------------------------------------------
-- Ciclo de dia y noche (un dia completo = 12 minutos)
----------------------------------------------------------------------
local DAY_SECONDS = 12 * 60
local lampsOn = nil
while true do
	local dt = task.wait(0.5)
	Lighting.ClockTime = (Lighting.ClockTime + dt * 24 / DAY_SECONDS) % 24
	local t = Lighting.ClockTime
	local night = t < 6.3 or t > 18.2
	if night ~= lampsOn then
		lampsOn = night
		for _, lamp in ipairs(lamps) do
			lamp.Material = if night then M.Neon else M.SmoothPlastic
			local l = lamp:FindFirstChildOfClass("PointLight")
			if l then
				l.Enabled = night
			end
		end
	end
end

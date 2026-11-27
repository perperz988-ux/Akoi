-- World: la ciudad de Port Solano ya viene construida en el archivo del lugar
-- (generada desde el codigo del juego original). Este script rellena el mar,
-- el rio y la playa con Terrain, crea el punto de aparicion y controla el dia y la noche.

local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

Players.CharacterAutoLoads = false -- esperamos a que exista el mar

local Layout = require(ReplicatedStorage:WaitForChild("Layout"))
local M = Enum.Material
local SC = Layout.SCALE

----------------------------------------------------------------------
-- Iluminacion (soleada, estilo costa de Florida)
----------------------------------------------------------------------
Lighting.Ambient = Color3.fromRGB(70, 70, 80)
Lighting.OutdoorAmbient = Color3.fromRGB(140, 130, 130)
Lighting.Brightness = 2.6
Lighting.ClockTime = 10
Lighting.GeographicLatitude = 25
Lighting.EnvironmentDiffuseScale = 0.5
Lighting.EnvironmentSpecularScale = 0.6
Lighting.ShadowSoftness = 0.3

local atmosphere = Instance.new("Atmosphere")
atmosphere.Density = 0.32
atmosphere.Haze = 1.4
atmosphere.Color = Color3.fromRGB(255, 225, 205)
atmosphere.Decay = Color3.fromRGB(255, 150, 120)
atmosphere.Parent = Lighting

local bloom = Instance.new("BloomEffect")
bloom.Intensity = 0.7
bloom.Size = 30
bloom.Threshold = 1.5
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
-- Mar, rio y playa (Terrain), siguiendo groundY del juego original
----------------------------------------------------------------------
local terrain = workspace.Terrain
terrain.WaterColor = Color3.fromRGB(30, 140, 160)
terrain.WaterTransparency = 0.55
terrain.WaterReflectance = 0.7
terrain.WaterWaveSize = 0.15
terrain.WaterWaveSpeed = 8

local WATER_TOP = Layout.WATER_Y -- studs
local FLOOR = -40
local STEP = 10 -- metros
local HALF = Layout.HALF_M

local fills = 0
local function fillColumn(x0, x1, z0, z1, yTop)
	-- x/z en metros, yTop en studs
	local cx, cz = (x0 + x1) / 2 * SC, (z0 + z1) / 2 * SC
	local sx, sz = (x1 - x0) * SC, (z1 - z0) * SC
	local sandTop = math.max(yTop, FLOOR + 1)
	terrain:FillBlock(CFrame.new(cx, (FLOOR + sandTop) / 2, cz), Vector3.new(sx, sandTop - FLOOR, sz), M.Sand)
	if sandTop < WATER_TOP then
		terrain:FillBlock(CFrame.new(cx, (sandTop + WATER_TOP) / 2, cz), Vector3.new(sx, WATER_TOP - sandTop, sz), M.Water)
	end
	fills += 1
	if fills % 200 == 0 then
		task.wait()
	end
end

for z = -HALF, HALF - STEP, STEP do
	local runStart, runY = nil, nil
	local x = -HALF
	while x <= HALF do
		local y = nil
		if x < HALF then
			local g = Layout.groundMeters(x + STEP / 2, z + STEP / 2)
			if g < -0.05 then
				y = math.floor(g * SC * 2 + 0.5) / 2 -- studs, redondeado a 0.5
			end
		end
		if y ~= runY then
			if runY then
				fillColumn(runStart, x, z, z + STEP, runY)
			end
			runStart, runY = x, y
		end
		x += STEP
	end
end

-- Oceano abierto alrededor de la ciudad
local OUT = 800
local deep = -12 * SC
for _, r in ipairs({
	{ -HALF - OUT, HALF + OUT, -HALF - OUT, -HALF },
	{ -HALF - OUT, HALF + OUT, HALF, HALF + OUT },
	{ -HALF - OUT, -HALF, -HALF, HALF },
	{ HALF, HALF + OUT, -HALF, HALF },
}) do
	fillColumn(r[1], r[2], r[3], r[4], deep)
end
print(("[Port Solano] Terreno listo (%d bloques)"):format(fills))

----------------------------------------------------------------------
-- Punto de aparicion (el mismo que el juego original)
----------------------------------------------------------------------
local spawn = Instance.new("SpawnLocation")
spawn.Anchored = true
spawn.Size = Vector3.new(8, 0.4, 8)
spawn.CFrame = CFrame.new(Layout.SPAWN.X, 0.45, Layout.SPAWN.Z)
spawn.Transparency = 1
spawn.CanCollide = false
spawn.Duration = 3
spawn.Parent = workspace

workspace:SetAttribute("Day", 1)
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
	task.defer(function()
		if not plr.Character then
			plr:LoadCharacter()
		end
	end)
end)

----------------------------------------------------------------------
-- Ciclo de dia y noche (un dia completo = 16 minutos)
----------------------------------------------------------------------
local DAY_SECONDS = 16 * 60
while true do
	local dt = task.wait(0.5)
	local before = Lighting.ClockTime
	Lighting.ClockTime = (Lighting.ClockTime + dt * 24 / DAY_SECONDS) % 24
	if Lighting.ClockTime < before then
		workspace:SetAttribute("Day", (workspace:GetAttribute("Day") or 1) + 1)
	end
	local t = Lighting.ClockTime
	local night = t < 6.3 or t > 18.2
	Lighting.OutdoorAmbient = if night then Color3.fromRGB(90, 90, 120) else Color3.fromRGB(140, 130, 130)
end

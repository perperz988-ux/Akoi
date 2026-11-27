-- Peds: peatones como en src/ai/Peds.ts del original. Mismo modelo de bloques que
-- Humanoid.ts (torso, cabeza con pelo, brazos con antebrazo de piel, piernas y zapatos),
-- mismas paletas de piel/camisa/pantalon/pelo, caminan por las aceras de los distritos
-- urbanos, se apartan de los coches, gritan si casi los atropellas y caen si los golpeas.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Layout = require(ReplicatedStorage:WaitForChild("Layout"))

local player = Players.LocalPlayer
local SC = Layout.SCALE
local MAX_PEDS = 20
local SPAWN_MIN, SPAWN_MAX = 40 * SC, 140 * SC
local DESPAWN = 190 * SC
local SIDEWALK = 4 -- metros (como CityLayout.SIDEWALK)

-- paletas de Humanoid.ts
local function hex(h)
	return Color3.fromRGB(bit32.rshift(h, 16) % 256, bit32.rshift(h, 8) % 256, h % 256)
end
local SKINS = { 0xf1c9a5, 0xd9a577, 0xb97c50, 0x8a5a3a, 0x5e3b27, 0xe8b894 }
local SHIRTS = { 0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0xe67e22, 0x16a085, 0xd35400, 0x7f8c8d }
local PANTS = { 0x2c3e50, 0x34495e, 0x1b1b1f, 0x7b6a4f, 0x4a6fa5, 0x555a60 }
local HAIRS = { 0x1a1410, 0x3b2a1a, 0x6b4a2a, 0xc9a24a, 0x9a9a9a, 0x2a1a12 }
local BARKS_ANGRY = { "Watch it!", "Hey, I’m walking here!", "Are you blind?!", "Idiot!" }
-- distritos sin aceras ni peatones (isUrban del original): Beach, Airport, Rural, River, Ocean, Marina
local NOT_URBAN = { [4] = true, [9] = true, [10] = true, [12] = true, [13] = true, [14] = true }

_G.PS = _G.PS or {}
local peds = {}
_G.PS.peds = peds

local folder = Instance.new("Folder")
folder.Name = "Peatones"
folder.Parent = workspace
local rng = Random.new()

local function part(model, size, color)
	local p = Instance.new("Part")
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = true
	p.Size = size * SC
	p.Color = color
	p.Material = Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Parent = model
	return p
end

local function pick(t)
	return hex(t[rng:NextInteger(1, #t)])
end

-- construye el modelo de Humanoid.ts (medidas en metros)
local function buildPed()
	local model = Instance.new("Model")
	model.Name = "Peaton"
	local skin, shirt, pants, hair = pick(SKINS), pick(SHIRTS), pick(PANTS), pick(HAIRS)
	local P = {
		torso = part(model, Vector3.new(0.46, 0.58, 0.26), shirt),
		head = part(model, Vector3.new(0.22, 0.25, 0.23), skin),
		hair = part(model, Vector3.new(0.24, 0.1, 0.25), hair),
		armL = part(model, Vector3.new(0.12, 0.3, 0.12), shirt),
		armR = part(model, Vector3.new(0.12, 0.3, 0.12), shirt),
		foreL = part(model, Vector3.new(0.1, 0.28, 0.1), skin),
		foreR = part(model, Vector3.new(0.1, 0.28, 0.1), skin),
		legL = part(model, Vector3.new(0.17, 0.46, 0.17), pants),
		legR = part(model, Vector3.new(0.17, 0.46, 0.17), pants),
		shinL = part(model, Vector3.new(0.15, 0.46, 0.15), pants),
		shinR = part(model, Vector3.new(0.15, 0.46, 0.15), pants),
		shoeL = part(model, Vector3.new(0.16, 0.08, 0.26), Color3.fromRGB(34, 34, 34)),
		shoeR = part(model, Vector3.new(0.16, 0.08, 0.26), Color3.fromRGB(34, 34, 34)),
	}
	return model, P
end

local function m(x, y, z)
	return CFrame.new(x * SC, y * SC, z * SC)
end

-- pose: base = CFrame del suelo; phase/amp = ciclo de paso; fall = 0..1 (tumbado)
local function pose(P, base, phase, amp, fall)
	local s = math.sin(phase)
	local hipsY = 0.95 + math.abs(math.cos(phase)) * 0.035 * amp
	local root = base * CFrame.Angles(-fall * math.pi / 2, 0, 0) * m(0, hipsY - fall * 0.75, 0)
	-- en Roblox el frente es -Z: una pierna "adelante" rota sobre X en negativo
	local swing = 0.75 * amp
	local aSw = 0.8 * amp
	local function limb(top, upper, lower, shoe, x, y, rot, rotLower, lenU, lenL)
		local joint = root * m(x, y, 0) * CFrame.Angles(rot, 0, 0)
		upper.CFrame = joint * m(0, -lenU / 2, 0)
		local knee = joint * m(0, -lenU, 0) * CFrame.Angles(rotLower, 0, 0)
		lower.CFrame = knee * m(0, -lenL / 2, 0)
		if shoe then
			shoe.CFrame = knee * m(0, -lenL, -0.04)
		end
	end
	P.torso.CFrame = root * m(0, 0.3, 0)
	P.head.CFrame = root * m(0, 0.74, 0)
	P.hair.CFrame = root * m(0, 0.84, 0)
	limb(nil, P.legL, P.shinL, P.shoeL, -0.12, 0, s * swing, -math.max(0, -s) * amp, 0.46, 0.46)
	limb(nil, P.legR, P.shinR, P.shoeR, 0.12, 0, -s * swing, -math.max(0, s) * amp, 0.46, 0.46)
	limb(nil, P.armL, P.foreL, nil, -0.3, 0.55, -s * aSw, 0.2, 0.3, 0.28)
	limb(nil, P.armR, P.foreR, nil, 0.3, 0.55, s * aSw, 0.2, 0.3, 0.28)
end

local function sidewalkPath(r, side, reverse)
	local pa, pb = Layout.nodePos(r.a), Layout.nodePos(r.b)
	local d = (pb - pa).Unit
	local off = Vector3.new(-d.Z, 0, d.X) * side * (r.hw + SIDEWALK / 2) * SC
	local a = pa + off + d * (Layout.nodeHalfWidth(r.a) + 1) * SC
	local b = pb + off - d * (Layout.nodeHalfWidth(r.b) + 1) * SC
	if reverse then
		a, b = b, a
	end
	return a, b
end

local function urbanRoad(r)
	local mid = (Layout.nodePos(r.a) + Layout.nodePos(r.b)) / 2
	return not r.bridge and not r.dirt and not NOT_URBAN[Layout.districtIdAt(mid.X + SC, mid.Z + SC)]
end

local function refPosition()
	if not player:GetAttribute("InGame") then
		return nil
	end
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	return root and root.Position
end

local function bark(ped, text)
	if ped.barkT and os.clock() - ped.barkT < 4 then
		return
	end
	ped.barkT = os.clock()
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.new(0, 180, 0, 28)
	bb.StudsOffsetWorldSpace = Vector3.new(0, 2.4 * SC, 0)
	bb.Adornee = ped.P.head
	bb.AlwaysOnTop = true
	local l = Instance.new("TextLabel")
	l.Size = UDim2.fromScale(1, 1)
	l.BackgroundTransparency = 0.25
	l.BackgroundColor3 = Color3.fromRGB(26, 32, 44)
	l.TextColor3 = Color3.new(1, 1, 1)
	l.Font = Enum.Font.GothamBold
	l.TextScaled = true
	l.Text = text
	Instance.new("UICorner", l).CornerRadius = UDim.new(1, 0)
	l.Parent = bb
	bb.Parent = ped.model
	task.delay(2.2, function()
		bb:Destroy()
	end)
end

local function spawnPed(ref)
	for _ = 1, 30 do
		local r = Layout.ROADS[rng:NextInteger(1, #Layout.ROADS)]
		local mid = (Layout.nodePos(r.a) + Layout.nodePos(r.b)) / 2
		local dist = (Vector3.new(mid.X, 0, mid.Z) - Vector3.new(ref.X, 0, ref.Z)).Magnitude
		if dist > SPAWN_MIN and dist < SPAWN_MAX and urbanRoad(r) then
			local side = if rng:NextNumber() < 0.5 then 1 else -1
			local a, b = sidewalkPath(r, side, rng:NextNumber() < 0.5)
			local model, P = buildPed()
			local ped = { model = model, P = P, road = r, side = side, a = a, b = b, speed = rng:NextNumber(1.2, 1.7) * SC,
				phase = rng:NextNumber() * 6, fall = 0, state = "walk" }
			ped.t = rng:NextNumber() * (b - a).Magnitude
			ped.len = (b - a).Magnitude
			model.Parent = folder
			table.insert(peds, ped)
			return
		end
	end
end

local function nextSegment(ped)
	-- en la esquina elige otra calle que salga del mismo cruce (o se da la vuelta)
	local node = if (ped.b - Layout.nodePos(ped.road.a)).Magnitude < (ped.b - Layout.nodePos(ped.road.b)).Magnitude then ped.road.a else ped.road.b
	local opts = {}
	for _, r in ipairs(Layout.ROADS) do
		if (r.a == node or r.b == node) and r ~= ped.road and urbanRoad(r) then
			table.insert(opts, r)
		end
		if #opts >= 4 then
			break
		end
	end
	local r = if #opts > 0 and rng:NextNumber() < 0.8 then opts[rng:NextInteger(1, #opts)] else ped.road
	local a, b = sidewalkPath(r, ped.side, r.b == node)
	if r == ped.road then
		a, b = ped.b, ped.a
	end
	ped.road, ped.a, ped.b = r, ped.b, b
	ped.len = (ped.b - ped.a).Magnitude
	ped.t = 0
end

-- coche del jugador (para atropellos)
local function playerCar()
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	local seat = hum and hum.SeatPart
	if seat and seat:IsA("VehicleSeat") then
		local chassis = seat.Parent and seat.Parent:FindFirstChild("Chassis")
		return chassis
	end
	return nil
end

local spawnTimer = 0
RunService.Heartbeat:Connect(function(dt)
	dt = math.min(dt, 0.1)
	local ref = refPosition()
	if not ref then
		return
	end
	spawnTimer -= dt
	if spawnTimer <= 0 and #peds < MAX_PEDS then
		spawnTimer = 0.3
		spawnPed(ref)
	end
	local car = playerCar()
	local carVel = car and car.AssemblyLinearVelocity or Vector3.zero
	for i = #peds, 1, -1 do
		local ped = peds[i]
		local pos = ped.pos or ped.a
		if (pos - ref).Magnitude > DESPAWN or (ped.state == "down" and ped.downT > 8) then
			ped.model:Destroy()
			table.remove(peds, i)
			continue
		end
		if ped.state == "down" then
			ped.downT += dt
			ped.fall = math.min(1, ped.fall + dt * 4)
			pose(ped.P, ped.base, ped.phase, 0, ped.fall)
			continue
		end
		-- reaccion al coche del jugador
		local speed = ped.speed
		if car then
			local rel = pos - car.Position
			local d = Vector3.new(rel.X, 0, rel.Z).Magnitude
			local v = carVel.Magnitude
			if d < 2.2 * SC and v > 6 * SC then
				ped.state = "down"
				ped.downT = 0
				ped.pos = pos
				_G.PS.hitPed = (_G.PS.hitPed or 0) + 1
				if _G.PS.reportCrime then
					_G.PS.reportCrime("ped", pos)
				end
				continue
			elseif d < 9 * SC and v > 3 * SC and rel:Dot(carVel) < 0 then
				bark(ped, BARKS_ANGRY[rng:NextInteger(1, #BARKS_ANGRY)])
				speed = ped.speed * 3.4
			end
		end
		ped.t += speed * dt
		if ped.t >= ped.len then
			nextSegment(ped)
		end
		local dir = (ped.b - ped.a)
		dir = if dir.Magnitude > 0.01 then dir.Unit else Vector3.new(0, 0, -1)
		local p = ped.a + dir * ped.t
		ped.pos = Vector3.new(p.X, 0.25, p.Z)
		ped.phase += dt * (3 + (speed / SC) * 1.5)
		ped.base = CFrame.lookAt(ped.pos, ped.pos + dir)
		if (ped.pos - ref).Magnitude < 120 * SC then
			pose(ped.P, ped.base, ped.phase, math.min(1, 0.35 + (speed / SC) / 5), 0)
		end
	end
end)

-- Traffic: trafico civil como en src/ai/Traffic.ts del original.
-- Cada cliente simula sus propios coches alrededor del jugador (el original es de un jugador):
-- circulan por el carril derecho de la red de calles, giran en los cruces con una curva,
-- usan la mezcla de vehiculos TRAFFIC_MIX del original y frenan ante obstaculos.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Layout = require(ReplicatedStorage:WaitForChild("Layout"))
local VehicleModel = require(ReplicatedStorage:WaitForChild("VehicleModel"))

local player = Players.LocalPlayer
local SC = Layout.SCALE
local MAX_CARS = 14
local SPAWN_MIN, SPAWN_MAX = 120 * SC, 300 * SC
local DESPAWN = 380 * SC
local CITY_SPEED, HWY_SPEED, TURN_SPEED = 13 * SC, 22 * SC, 6 * SC

_G.PS = _G.PS or {}
local cars = {}
_G.PS.traffic = cars

local folder = Instance.new("Folder")
folder.Name = "Trafico"
folder.Parent = workspace

local rng = Random.new()

local function rightOf(d)
	return Vector3.new(-d.Z, 0, d.X)
end
local function lane(hw)
	return math.max(2.2, hw * 0.5) * SC
end

-- tramo recto por el carril derecho entre dos cruces
local function edgePiece(A, B, hw)
	local pa, pb = Layout.nodePos(A), Layout.nodePos(B)
	local d = (pb - pa).Unit
	local r = rightOf(d) * lane(hw)
	return { a = pa + d * Layout.nodeHalfWidth(A) * SC + r, b = pb - d * Layout.nodeHalfWidth(B) * SC + r }
end
-- curva dentro del cruce N, viniendo de A y saliendo hacia B
local function turnPiece(A, N, B, hwIn, hwOut)
	local pN = Layout.nodePos(N)
	local dIn = (pN - Layout.nodePos(A)).Unit
	local dOut = (Layout.nodePos(B) - pN).Unit
	local hwn = Layout.nodeHalfWidth(N) * SC
	local a = pN - dIn * hwn + rightOf(dIn) * lane(hwIn)
	local b = pN + dOut * hwn + rightOf(dOut) * lane(hwOut)
	local dot = dIn:Dot(dOut)
	if dot > 0.9 then
		return { a = a, b = b }
	elseif dot < -0.9 then
		return { a = a, b = b, c = pN + dIn * hwn * 0.9 }
	end
	return { a = a, b = b, c = a + dIn * (b - a):Dot(dIn) }
end
local function evalPiece(p, t)
	if p.c then
		local u = 1 - t
		return p.a * u * u + p.c * 2 * u * t + p.b * t * t, (p.c - p.a) * 2 * u + (p.b - p.c) * 2 * t
	end
	return p.a:Lerp(p.b, t), p.b - p.a
end
local function pieceLen(p)
	if p.c then
		return math.max(1, ((p.c - p.a).Magnitude + (p.b - p.c).Magnitude + (p.b - p.a).Magnitude) / 2)
	end
	return math.max(1, (p.b - p.a).Magnitude)
end
local function setPiece(car, p, mode)
	car.piece, car.mode, car.t, car.len = p, mode, 0, pieceLen(p)
end

local function edgeInfo(A, B)
	for _, e in ipairs(Layout.GRAPH[A] or {}) do
		if e.to == B then
			return e
		end
	end
	return { hw = 7, hwy = false }
end

local function chooseNext(car)
	local opts = {}
	for _, e in ipairs(Layout.GRAPH[car.to] or {}) do
		if e.to ~= car.from then
			table.insert(opts, e)
		end
	end
	if #opts == 0 then
		return { to = car.from, hw = car.hw, hwy = car.hwy }
	end
	return opts[rng:NextInteger(1, #opts)]
end

local function refPosition()
	if player:GetAttribute("InGame") then
		local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
		return root and root.Position
	end
	local cam = workspace.CurrentCamera
	return cam and Vector3.new(cam.CFrame.Position.X, 0, cam.CFrame.Position.Z)
end

local function spawnCar(ref)
	for _ = 1, 25 do
		local r = Layout.ROADS[rng:NextInteger(1, #Layout.ROADS)]
		local pa, pb = Layout.nodePos(r.a), Layout.nodePos(r.b)
		local mid = (pa + pb) / 2
		local dist = (Vector3.new(mid.X, 0, mid.Z) - Vector3.new(ref.X, 0, ref.Z)).Magnitude
		if dist > SPAWN_MIN and dist < SPAWN_MAX and Layout.GRAPH[r.a] and Layout.GRAPH[r.b] then
			local from, to = r.a, r.b
			if rng:NextNumber() < 0.5 then
				from, to = r.b, r.a
			end
			local id = VehicleModel.randomTrafficId(rng)
			local model, def = VehicleModel.build(id, nil, CFrame.new())
			model.WorldPivot = CFrame.new()
			local car = { model = model, def = def, from = from, to = to, hw = r.hw, hwy = r.hwy, speed = CITY_SPEED * 0.6 }
			setPiece(car, edgePiece(from, to, r.hw), "edge")
			car.t = rng:NextNumber() * car.len * 0.8
			model.Parent = folder
			table.insert(cars, car)
			return
		end
	end
end

local function despawn(i)
	local car = table.remove(cars, i)
	if car and car.model then
		car.model:Destroy()
	end
end

local function obstacles()
	local list = {}
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root then
		table.insert(list, root.Position)
	end
	for _, ped in ipairs(_G.PS.peds or {}) do
		if ped.pos then
			table.insert(list, ped.pos)
		end
	end
	return list
end

local spawnTimer = 0
RunService.Heartbeat:Connect(function(dt)
	dt = math.min(dt, 0.1)
	local ref = refPosition()
	if not ref then
		return
	end
	spawnTimer -= dt
	if spawnTimer <= 0 and #cars < MAX_CARS then
		spawnTimer = 0.4
		spawnCar(ref)
	end

	local obs = obstacles()
	for i = #cars, 1, -1 do
		local car = cars[i]
		if car.dead then
			continue
		end
		local pos = car.pos or car.piece.a
		if (Vector3.new(pos.X, 0, pos.Z) - Vector3.new(ref.X, 0, ref.Z)).Magnitude > DESPAWN or not car.model.Parent then
			despawn(i)
			continue
		end

		-- velocidad objetivo y frenado ante obstaculos
		local target = if car.mode == "turn" then TURN_SPEED elseif car.hwy then HWY_SPEED else CITY_SPEED
		local fwd = car.fwd or Vector3.new(0, 0, -1)
		local right = rightOf(fwd)
		local function check(o)
			local rel = o - pos
			local f = rel:Dot(fwd)
			if f > 0 and f < 16 * SC and math.abs(rel:Dot(right)) < 1.7 * SC and math.abs(rel.Y) < 6 * SC then
				target = math.min(target, math.max(0, f - 6 * SC) * 1.1)
			end
		end
		for _, o in ipairs(obs) do
			check(o)
		end
		for _, other in ipairs(cars) do
			if other ~= car and other.pos then
				check(other.pos)
			end
		end
		local accel = if target > car.speed then 5 * SC else 14 * SC
		car.speed += math.clamp(target - car.speed, -accel * dt, accel * dt)
		car.brake = target < car.speed - 0.5

		-- avanzar por la pieza actual
		car.t += car.speed * dt
		while car.t >= car.len do
			local extra = car.t - car.len
			if car.mode == "edge" then
				local nxt = chooseNext(car)
				car.nextE = nxt
				setPiece(car, turnPiece(car.from, car.to, nxt.to, car.hw, nxt.hw), "turn")
			else
				local nxt = car.nextE
				car.from, car.to, car.hw, car.hwy = car.to, nxt.to, nxt.hw, nxt.hwy
				setPiece(car, edgePiece(car.from, car.to, car.hw), "edge")
			end
			car.t = extra
		end
		local p, tan = evalPiece(car.piece, car.t / car.len)
		if tan.Magnitude > 0.01 then
			car.fwd = Vector3.new(tan.X, 0, tan.Z).Unit
		end
		car.pos = Vector3.new(p.X, 0.06, p.Z)
		car.model:PivotTo(CFrame.lookAt(car.pos, car.pos + car.fwd))
	end
end)

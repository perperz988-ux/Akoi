-- Police: nivel de busqueda y persecucion como src/ai/Police.ts del original.
--  * Cada crimen suma "calor" (CRIME_BASE); con HEAT_STEPS = 0.9 / 3 / 6.5 / 11 / 17 subes de estrella.
--  * Los peatones que lo ven pueden llamar a la policia ("A witness called the police").
--  * Patrullas (Interceptor, Enforcer y Bearcat del original) salen por las calles y te persiguen.
--  * Si no te ven, las estrellas parpadean y el calor baja tras 14 + 7*nivel segundos.
--  * Con 1-2 estrellas te arrestan si te paras junto a ellos (BUSTED); desde 3 te disparan.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Lighting = game:GetService("Lighting")

local Layout = require(ReplicatedStorage:WaitForChild("Layout"))
local VehicleModel = require(ReplicatedStorage:WaitForChild("VehicleModel"))
local PoliceRemote = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Police")

local player = Players.LocalPlayer
local SC = Layout.SCALE
local rng = Random.new()

local CRIME_BASE = { assault = 0.9, murder = 2.2, gunfire = 0.6, carjack = 1.6, grandtheft = 0.9, hitrun = 1.0, vehicular = 2.0, copassault = 2.5, weapon = 0.5 }
local HEAT_STEPS = { 0.9, 3, 6.5, 11, 17 }
local WANT_CARS = { [0] = 0, 2, 3, 4, 5, 6 } -- original: 0,2,4,6,8,10 (reducido para movil)

_G.PS = _G.PS or {}
local cops = {}
_G.PS.cops = cops

local P = { heat = 0, wanted = 0, seen = false, seenT = 0, searchT = 0, lastKnown = Vector3.zero, bustedT = 0, spawnT = 0 }

local folder = Instance.new("Folder")
folder.Name = "Policia"
folder.Parent = workspace

----------------------------------------------------------------------
-- Mensajes grandes (BUSTED / WASTED) y barra de arresto, como #bigmsg y #bustbar
----------------------------------------------------------------------
local gui = Instance.new("ScreenGui")
gui.Name = "PortSolanoPolice"
gui.IgnoreGuiInset = true
gui.ResetOnSpawn = false
gui.DisplayOrder = 20
gui.Parent = player:WaitForChild("PlayerGui")
local big = Instance.new("Frame")
big.Size = UDim2.fromScale(1, 1)
big.BackgroundColor3 = Color3.new(0, 0, 0)
big.BackgroundTransparency = 0.55
big.Visible = false
big.Parent = gui
local bigT = Instance.new("TextLabel")
bigT.AnchorPoint = Vector2.new(0.5, 0.5)
bigT.Position = UDim2.fromScale(0.5, 0.45)
bigT.Size = UDim2.new(1, 0, 0, 70)
bigT.BackgroundTransparency = 1
bigT.Font = Enum.Font.GothamBlack
bigT.TextSize = 64
bigT.TextStrokeTransparency = 0.5
bigT.Parent = big
local bigP = bigT:Clone()
bigP.Position = UDim2.fromScale(0.5, 0.45)
bigP.Size = UDim2.new(1, 0, 0, 24)
bigP.Position = UDim2.new(0.5, 0, 0.45, 52)
bigP.Font = Enum.Font.Gotham
bigP.TextSize = 18
bigP.TextColor3 = Color3.fromRGB(0x9a, 0xa7, 0xbb)
bigP.Parent = big
local function bigMessage(title, sub, color, ttl)
	bigT.Text = title
	bigT.TextColor3 = color
	bigP.Text = sub
	big.Visible = true
	task.delay(ttl or 2.6, function()
		big.Visible = false
	end)
end
_G.PS.bigMessage = bigMessage

local bust = Instance.new("Frame")
bust.AnchorPoint = Vector2.new(0.5, 1)
bust.Position = UDim2.new(0.5, 0, 1, -110)
bust.Size = UDim2.fromOffset(220, 8)
bust.BackgroundColor3 = Color3.new(1, 1, 1)
bust.BackgroundTransparency = 0.8
bust.Visible = false
bust.Parent = gui
Instance.new("UICorner", bust).CornerRadius = UDim.new(1, 0)
local bustFill = Instance.new("Frame")
bustFill.Size = UDim2.fromScale(0, 1)
bustFill.BackgroundColor3 = Color3.fromRGB(0x38, 0xbd, 0xf8)
bustFill.Parent = bust
Instance.new("UICorner", bustFill).CornerRadius = UDim.new(1, 0)

local function toast(t)
	if _G.PS.toast then
		_G.PS.toast(t)
	end
end

----------------------------------------------------------------------
-- Calor y nivel
----------------------------------------------------------------------
local function syncAttrs()
	player:SetAttribute("Wanted", P.wanted)
	player:SetAttribute("WantedSeen", P.seen)
end

local function myPos()
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	return root and root.Position
end

local function addHeat(amount, seenNow)
	local prev = P.wanted
	P.heat = math.min(HEAT_STEPS[5] + 6, P.heat + amount)
	local lvl = 0
	for i, s in ipairs(HEAT_STEPS) do
		if P.heat >= s then
			lvl = i
		end
	end
	P.wanted = math.max(P.wanted, lvl)
	local pos = myPos()
	if seenNow then
		P.seen, P.seenT = true, 0
		if pos then
			P.lastKnown = pos
		end
	elseif prev == 0 and pos then
		P.lastKnown = pos
		P.seen, P.searchT = false, 0
	end
	syncAttrs()
end

local function clearWanted()
	P.heat, P.wanted, P.seen, P.bustedT = 0, 0, false, 0
	bust.Visible = false
	for i = #cops, 1, -1 do
		cops[i].leaving = true
	end
	syncAttrs()
end
_G.PS.clearWanted = clearWanted

-- Mismo criterio que reportCrime(): la policia que lo ve sube el calor al momento;
-- los civiles que lo ven pueden llamar (55% + 12% por gravedad) a los pocos segundos.
local function reportCrime(kind, pos, severity)
	if not player:GetAttribute("InGame") then
		return
	end
	severity = severity or 1
	local base = (CRIME_BASE[kind] or 0.5) * severity * 0.9
	local copSaw = false
	for _, c in ipairs(cops) do
		if c.pos and (c.pos - pos).Magnitude < 60 * SC then
			copSaw = true
		end
	end
	local civSaw = 0
	for _, ped in ipairs(_G.PS.peds or {}) do
		if ped.pos and ped.state ~= "down" and (ped.pos - pos).Magnitude < 32 * SC then
			civSaw += 1
		end
	end
	if copSaw then
		addHeat(base, true)
	elseif civSaw > 0 and rng:NextNumber() < 0.55 + severity * 0.12 then
		task.delay(rng:NextNumber(3, 6), function()
			toast("A witness called the police")
			addHeat(base * 0.9, false)
		end)
	end
	if P.wanted > 0 and (copSaw or P.seen) then
		addHeat(base * 0.5, true)
	end
end
_G.PS.reportCrime = function(kind, pos)
	if kind == "ped" then
		reportCrime("vehicular", pos, 1)
	else
		reportCrime(kind, pos, 1)
	end
end

----------------------------------------------------------------------
-- Patrullas
----------------------------------------------------------------------
local function nearestNode(pos)
	local mx, mz = pos.X / SC, pos.Z / SC
	local i = math.floor((mx + 1600) / 100 + 0.5)
	local j = math.floor((mz + 1600) / 100 + 0.5)
	local best, bd = nil, math.huge
	for di = -1, 1 do
		for dj = -1, 1 do
			local k = Layout.nodeKey(i + di, j + dj)
			if Layout.GRAPH[k] then
				local d = (Layout.nodePos(k) - Vector3.new(pos.X, 0, pos.Z)).Magnitude
				if d < bd then
					best, bd = k, d
				end
			end
		end
	end
	return best
end

local function spawnCop(target)
	local lvl = P.wanted
	for _ = 1, 30 do
		local r = Layout.ROADS[rng:NextInteger(1, #Layout.ROADS)]
		local pa = Layout.nodePos(r.a)
		local d = (pa - Vector3.new(target.X, 0, target.Z)).Magnitude
		if d > 100 * SC and d < 200 * SC then
			local id = if lvl >= 4 and rng:NextNumber() < 0.4 then "swat_van" elseif lvl >= 3 and rng:NextNumber() < 0.4 then "pd_suv" else "pd_cruiser"
			local model, def = VehicleModel.build(id, nil, CFrame.new())
			model.WorldPivot = CFrame.new()
			model.Parent = folder
			local c = { model = model, def = def, node = r.a, pos = pa, fwd = (Layout.nodePos(r.b) - pa).Unit, speed = 8 * SC, target = nil }
			c.red = model:FindFirstChild("SirenaRoja")
			c.blue = model:FindFirstChild("SirenaAzul")
			table.insert(cops, c)
			return
		end
	end
end

local params = RaycastParams.new()
params.FilterType = Enum.RaycastFilterType.Exclude
local function lineOfSight(a, b)
	params.FilterDescendantsInstances = { folder, player.Character, workspace:FindFirstChild("Trafico"), workspace:FindFirstChild("Peatones"), workspace:FindFirstChild("Coches") }
	local from = a + Vector3.new(0, 3 * SC, 0)
	local to = b + Vector3.new(0, 1.5 * SC, 0)
	return workspace:Raycast(from, to - from, params) == nil
end

-- siguiente cruce: el vecino que mas acerca al objetivo (como el "greedy lattice step" del original)
local function nextNode(node, prevNode, target)
	local best, bd = nil, math.huge
	for _, e in ipairs(Layout.GRAPH[node] or {}) do
		local d = (Layout.nodePos(e.to) - Vector3.new(target.X, 0, target.Z)).Magnitude + (if e.to == prevNode then 60 * SC else 0)
		if d < bd then
			best, bd = e.to, d
		end
	end
	return best
end

local function playerSpeed()
	local root = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
	return root and root.AssemblyLinearVelocity.Magnitude or 0
end
local function inVehicle()
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	return hum and hum.SeatPart ~= nil
end

----------------------------------------------------------------------
-- Choques con el trafico (hit & run) y peatones atropellados
----------------------------------------------------------------------
local hitCooldown = {}
local function checkCollisions(pos)
	if not inVehicle() then
		return
	end
	local v = playerSpeed()
	if v < 8 * SC then
		return
	end
	for _, car in ipairs(_G.PS.traffic or {}) do
		if car.pos and (car.pos - pos).Magnitude < (car.def.len / 2 + 2.5) * SC and not hitCooldown[car] then
			hitCooldown[car] = true
			car.speed = 0
			reportCrime("hitrun", pos, if v > 16 * SC then 0.8 else 0.4)
			task.delay(4, function()
				hitCooldown[car] = nil
			end)
		end
	end
	for _, c in ipairs(cops) do
		if c.pos and (c.pos - pos).Magnitude < (c.def.len / 2 + 2.5) * SC and not hitCooldown[c] then
			hitCooldown[c] = true
			addHeat(CRIME_BASE.copassault * 0.9 * 0.6, true)
			task.delay(4, function()
				hitCooldown[c] = nil
			end)
		end
	end
end

----------------------------------------------------------------------
-- Bucle
----------------------------------------------------------------------
PoliceRemote.OnClientEvent:Connect(function(kind, fee)
	if kind == "busted" then
		clearWanted()
		bigMessage("BUSTED", ("Released on $%d bail"):format(fee or 0), Color3.fromRGB(0x38, 0xbd, 0xf8))
	elseif kind == "wasted" then
		clearWanted()
		bigMessage("WASTED", ("Hospital bill $%d"):format(fee or 0), Color3.fromRGB(0xff, 0x4d, 0x6d), 3.5)
	end
end)

local flash = 0
local hurtT = 0
RunService.Heartbeat:Connect(function(dt)
	dt = math.min(dt, 0.1)
	local pos = myPos()
	if not pos or not player:GetAttribute("InGame") then
		return
	end
	checkCollisions(pos)
	local lvl = P.wanted

	-- ¿te ve algun policia?
	if lvl > 0 then
		P.seenT += dt
		local night = Lighting.ClockTime < 6.3 or Lighting.ClockTime > 18.2
		local range = (if inVehicle() then 85 else 62) * (if night then 0.7 else 1) * (1 + lvl * 0.08) * SC
		local spotted = false
		for _, c in ipairs(cops) do
			if c.pos and (c.pos - pos).Magnitude < range and lineOfSight(c.pos, pos) then
				spotted = true
				break
			end
		end
		if spotted then
			P.seen, P.seenT, P.lastKnown, P.searchT = true, 0, pos, 0
			if P.heat < HEAT_STEPS[lvl] then
				P.heat = HEAT_STEPS[lvl]
			end
		elseif P.seen and P.seenT > 3 then
			P.seen = false
			toast("Lost sight — stay hidden")
		end
		if not P.seen then
			P.searchT += dt
			if P.searchT > 14 + lvl * 7 then
				P.heat = math.max(0, P.heat - dt * (1.2 + lvl * 0.2))
				local nl = 0
				for i, s in ipairs(HEAT_STEPS) do
					if P.heat >= s then
						nl = i
					end
				end
				if nl < lvl then
					P.wanted = nl
					if nl == 0 then
						toast("Wanted level cleared")
						clearWanted()
					end
				end
			end
		end
		syncAttrs()
	end

	-- enviar patrullas
	P.spawnT -= dt
	local alive = 0
	for _, c in ipairs(cops) do
		if not c.leaving then
			alive += 1
		end
	end
	if lvl > 0 and P.spawnT <= 0 and alive < WANT_CARS[lvl] then
		P.spawnT = 2.2 - lvl * 0.25
		spawnCop(P.lastKnown)
	end

	-- mover patrullas
	flash += dt
	local target = if P.seen then pos else P.lastKnown
	local nearStopped = 0
	for i = #cops, 1, -1 do
		local c = cops[i]
		local far = (c.pos - pos).Magnitude
		if (c.leaving and far > 150 * SC) or far > 450 * SC then
			c.model:Destroy()
			table.remove(cops, i)
			continue
		end
		local top = math.min(c.def.topSpeed * (0.78 + lvl * 0.04), 40) * SC
		local goal
		if c.leaving then
			goal = c.pos + c.fwd * 50 * SC
		elseif far < 45 * SC and lineOfSight(c.pos, pos) then
			goal = target
			top = math.min(top, math.max(0, far - 7 * SC) * 1.4)
		else
			if not c.nextNodeK or (Layout.nodePos(c.nextNodeK) - c.pos).Magnitude < 6 * SC then
				local from = c.nextNodeK or c.node
				c.prevNode = from
				c.nextNodeK = nextNode(from, c.prevNodeOld, target)
				c.prevNodeOld = from
			end
			goal = if c.nextNodeK then Layout.nodePos(c.nextNodeK) else target
		end
		local to = Vector3.new(goal.X - c.pos.X, 0, goal.Z - c.pos.Z)
		if to.Magnitude > 0.5 then
			local want = to.Unit
			c.fwd = c.fwd:Lerp(want, math.min(1, dt * 4)).Unit
		end
		c.speed += math.clamp(top - c.speed, -30 * SC * dt, 12 * SC * dt)
		c.pos += c.fwd * c.speed * dt
		c.pos = Vector3.new(c.pos.X, 0.06, c.pos.Z)
		c.model:PivotTo(CFrame.lookAt(c.pos, c.pos + c.fwd))
		-- sirenas
		local on = (flash * 6) % 2 < 1
		if c.red then
			c.red.Transparency = if on then 0 else 0.8
		end
		if c.blue then
			c.blue.Transparency = if on then 0.8 else 0
		end
		if not c.leaving and far < 9 * SC and c.speed < 2 * SC then
			nearStopped += 1
		end
		-- desde 3 estrellas disparan si te ven de cerca
		if not c.leaving and lvl >= 3 and P.seen and far < 25 * SC then
			hurtT -= dt
			if hurtT <= 0 then
				hurtT = 0.9
				PoliceRemote:FireServer("hurt", 3 + lvl)
			end
		end
	end

	-- arresto (BUSTED) con 1-2 estrellas si te quedas quieto junto a la policia
	if lvl > 0 and lvl <= 2 and nearStopped >= 1 and playerSpeed() < 3 * SC then
		P.bustedT += dt * (1 + nearStopped * 0.3)
		bust.Visible = true
		bustFill.Size = UDim2.fromScale(math.clamp(P.bustedT / 2.2, 0, 1), 1)
		if P.bustedT >= 2.2 then
			P.bustedT = 0
			bust.Visible = false
			PoliceRemote:FireServer("busted", lvl)
		end
	else
		P.bustedT = math.max(0, P.bustedT - dt * 1.5)
		bust.Visible = P.bustedT > 0
		bustFill.Size = UDim2.fromScale(math.clamp(P.bustedT / 2.2, 0, 1), 1)
	end
end)

player.CharacterAdded:Connect(function()
	-- al reaparecer (WASTED) se borra la busqueda
	clearWanted()
end)
syncAttrs()

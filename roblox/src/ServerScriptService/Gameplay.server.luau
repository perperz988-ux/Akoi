-- Gameplay: dinero, paquetes ocultos (64, como en el original), trabajos de reparto
-- y guardado de progreso (DataStore).

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local DataStoreService = game:GetService("DataStoreService")

local Layout = require(ReplicatedStorage:WaitForChild("Layout"))

local function getRemote(name)
	local f = ReplicatedStorage:FindFirstChild("Remotes")
	if not f then
		f = Instance.new("Folder")
		f.Name = "Remotes"
		f.Parent = ReplicatedStorage
	end
	local r = f:FindFirstChild(name)
	if not r then
		r = Instance.new("RemoteEvent")
		r.Name = name
		r.Parent = f
	end
	return r
end
local ShellRemote = getRemote("Shells") -- servidor -> cliente: ("state", {indices}) / ("got", i)
local JobRemote = getRemote("Job") -- cliente -> servidor: "start"/"cancel"; servidor -> cliente: estado
local NotifyRemote = getRemote("Notify") -- servidor -> cliente: texto

local SHELL_REWARD = 250
local START_MONEY = 500
local SLOT_COUNT = 3
local SlotsRemote = getRemote("Slots") -- menu de inicio: lista de slots / empezar partida

----------------------------------------------------------------------
-- Datos de jugador: 3 slots de guardado, como el juego original
----------------------------------------------------------------------
local store = nil
pcall(function()
	store = DataStoreService:GetDataStore("PortSolano_v3")
end)

-- data[player] = { record = { slots = {...}, last = n }, loaded, slot, free, money, shells, started }
local data = {}

local function slotSummaries(d)
	local out = {}
	for s = 1, SLOT_COUNT do
		local sl = d.record.slots[tostring(s)]
		if sl then
			table.insert(out, { slot = s, used = true, money = sl.money, chapter = if sl.free then "Free Roam" else "Story", playTime = sl.playTime or 0, time = sl.time or 0 })
		else
			table.insert(out, { slot = s, used = false })
		end
	end
	return out, d.record.last
end

local function writeSlot(d)
	if not d.slot then
		return
	end
	local list = {}
	for i in pairs(d.shells) do
		table.insert(list, i)
	end
	local playTime = d.playTime + (os.clock() - d.started)
	d.record.slots[tostring(d.slot)] = { money = d.money, shells = list, playTime = math.floor(playTime), time = os.time(), free = d.free }
	d.record.last = d.slot
end

local function save(plr)
	local d = data[plr]
	if not (d and d.slot) then
		return
	end
	writeSlot(d)
	if store and d.loaded then
		pcall(function()
			store:SetAsync("u" .. plr.UserId, d.record)
		end)
	end
end

local function updateStats(plr)
	local d = data[plr]
	local ls = plr:FindFirstChild("leaderstats")
	if not (d and ls) then
		return
	end
	ls.Dinero.Value = d.money
	local n = 0
	for _ in pairs(d.shells) do
		n += 1
	end
	ls.Paquetes.Value = n
end

local function addMoney(plr, amount, reason)
	local d = data[plr]
	if not (d and d.slot) then
		return
	end
	d.money += amount
	updateStats(plr)
	if reason then
		NotifyRemote:FireClient(plr, ("+$%d  %s"):format(amount, reason))
	end
end

Players.PlayerAdded:Connect(function(plr)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local money = Instance.new("IntValue")
	money.Name = "Dinero"
	money.Parent = ls
	local shells = Instance.new("IntValue")
	shells.Name = "Paquetes"
	shells.Parent = ls
	ls.Parent = plr

	local d = { record = { slots = {} }, loaded = not store, money = 0, shells = {}, playTime = 0, started = os.clock() }
	data[plr] = d
	if store then
		local ok, saved = pcall(function()
			return store:GetAsync("u" .. plr.UserId)
		end)
		if ok and type(saved) == "table" and type(saved.slots) == "table" then
			d.record = saved
		end
		d.loaded = ok
	end
	d.ready = true
	SlotsRemote:FireClient(plr, "list", slotSummaries(d))
end)

SlotsRemote.OnServerEvent:Connect(function(plr, action, slot, mode)
	local d = data[plr]
	if not (d and d.ready) then
		return
	end
	if action == "list" then
		SlotsRemote:FireClient(plr, "list", slotSummaries(d))
		return
	end
	if action ~= "play" or d.slot then
		return
	end
	slot = tonumber(slot)
	if not slot or slot < 1 or slot > SLOT_COUNT or slot ~= math.floor(slot) then
		return
	end
	local saved = d.record.slots[tostring(slot)]
	if mode == "load" and saved then
		d.money = tonumber(saved.money) or START_MONEY
		d.shells = {}
		for _, i in ipairs(saved.shells or {}) do
			d.shells[i] = true
		end
		d.playTime = tonumber(saved.playTime) or 0
		d.free = saved.free == true
	else
		d.money = START_MONEY
		d.shells = {}
		d.playTime = 0
		d.free = mode == "free"
	end
	d.slot = slot
	d.started = os.clock()
	plr:SetAttribute("FreeRoam", d.free)
	updateStats(plr)
	save(plr)
	local list = {}
	for i in pairs(d.shells) do
		table.insert(list, i)
	end
	ShellRemote:FireClient(plr, "state", list)
	SlotsRemote:FireClient(plr, "started", slot, d.free)
	NotifyRemote:FireClient(plr, "Bienvenido a Port Solano")
end)

Players.PlayerRemoving:Connect(function(plr)
	save(plr)
	data[plr] = nil
end)

game:BindToClose(function()
	for _, plr in ipairs(Players:GetPlayers()) do
		save(plr)
	end
end)

task.spawn(function()
	while true do
		task.wait(120)
		for _, plr in ipairs(Players:GetPlayers()) do
			save(plr)
		end
	end
end)

----------------------------------------------------------------------
-- Conchas doradas
----------------------------------------------------------------------
while not workspace:GetAttribute("MapReady") do
	task.wait(0.2)
end

local shellFolder = Instance.new("Folder")
shellFolder.Name = "Paquetes"
shellFolder.Parent = workspace

for i, pos in ipairs(Layout.SHELLS) do
	local p = Instance.new("Part")
	p.Name = "Paquete" .. i
	p.Size = Vector3.new(2.2, 2.2, 2.2)
	p.Position = pos
	p.Anchored = true
	p.CanCollide = false
	p.Material = Enum.Material.Neon
	p.Color = Color3.fromRGB(255, 200, 40)
	p:SetAttribute("Index", i)
	local light = Instance.new("PointLight")
	light.Color = p.Color
	light.Range = 10
	light.Brightness = 2
	light.Parent = p
	local sparkle = Instance.new("Sparkles")
	sparkle.SparkleColor = p.Color
	sparkle.Parent = p
	p.Parent = shellFolder

	p.Touched:Connect(function(hit)
		local char = hit:FindFirstAncestorOfClass("Model")
		local plr = char and Players:GetPlayerFromCharacter(char)
		local d = plr and data[plr]
		if not d or not d.slot or d.shells[i] then
			return
		end
		d.shells[i] = true
		addMoney(plr, SHELL_REWARD, "Paquete oculto: " .. (Layout.SHELL_HINTS[i] or ""))
		ShellRemote:FireClient(plr, "got", i)
		if plr.leaderstats.Paquetes.Value == #Layout.SHELLS then
			addMoney(plr, 10000, "\u{A1}Encontraste TODOS los paquetes!")
		end
	end)
end

----------------------------------------------------------------------
-- Trabajos de reparto
----------------------------------------------------------------------
local jobs = {} -- [player] = { dest, name, reward, deadline, started }

local function flatDist(a, b)
	return Vector3.new(a.X - b.X, 0, a.Z - b.Z).Magnitude
end

JobRemote.OnServerEvent:Connect(function(plr, action)
	local root = plr.Character and plr.Character:FindFirstChild("HumanoidRootPart")
	if action == "cancel" then
		if jobs[plr] then
			jobs[plr] = nil
			JobRemote:FireClient(plr, "cancel")
		end
		return
	end
	local d = data[plr]
	if action ~= "start" or jobs[plr] or not root or not (d and d.slot) then
		return
	end
	if d.free then
		NotifyRemote:FireClient(plr, "Free Roam: no hay trabajos en este modo")
		return
	end
	local options = {}
	for _, d in ipairs(Layout.DESTINATIONS) do
		if flatDist(d.pos, root.Position) > 400 then
			table.insert(options, d)
		end
	end
	if #options == 0 then
		options = Layout.DESTINATIONS
	end
	local dest = options[math.random(1, #options)]
	local dist = flatDist(dest.pos, root.Position)
	local timeLimit = math.floor(dist / 30 + 30)
	local job = {
		pos = dest.pos,
		name = dest.name,
		reward = math.floor(dist / 10) * 10 + 150,
		deadline = os.clock() + timeLimit,
	}
	jobs[plr] = job
	JobRemote:FireClient(plr, "start", job.name, job.pos, job.reward, timeLimit)
end)

Players.PlayerRemoving:Connect(function(plr)
	jobs[plr] = nil
end)

while true do
	task.wait(0.25)
	for plr, job in pairs(jobs) do
		local root = plr.Character and plr.Character:FindFirstChild("HumanoidRootPart")
		if root and flatDist(root.Position, job.pos) < 24 then
			jobs[plr] = nil
			local onTime = os.clock() <= job.deadline
			local pay = if onTime then job.reward else math.floor(job.reward / 2)
			addMoney(plr, pay, if onTime then "Entrega a tiempo" else "Entrega tarde (mitad de pago)")
			JobRemote:FireClient(plr, "done", pay, onTime)
		end
	end
end

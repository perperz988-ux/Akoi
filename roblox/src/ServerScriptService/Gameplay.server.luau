-- Gameplay: dinero, conchas doradas coleccionables, trabajos de reparto
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

----------------------------------------------------------------------
-- Datos de jugador
----------------------------------------------------------------------
local store = nil
pcall(function()
	store = DataStoreService:GetDataStore("PortSolano_v1")
end)

local data = {} -- [player] = { money = n, shells = { [i] = true } }

local function save(plr)
	local d = data[plr]
	if not (store and d and d.loaded) then
		return
	end
	local list = {}
	for i in pairs(d.shells) do
		table.insert(list, i)
	end
	pcall(function()
		store:SetAsync("u" .. plr.UserId, { money = d.money, shells = list })
	end)
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
	ls.Conchas.Value = n
end

local function addMoney(plr, amount, reason)
	local d = data[plr]
	if not d then
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
	shells.Name = "Conchas"
	shells.Parent = ls
	ls.Parent = plr

	local d = { money = START_MONEY, shells = {}, loaded = false }
	data[plr] = d
	if store then
		local ok, saved = pcall(function()
			return store:GetAsync("u" .. plr.UserId)
		end)
		if ok and type(saved) == "table" then
			d.money = tonumber(saved.money) or START_MONEY
			for _, i in ipairs(saved.shells or {}) do
				d.shells[i] = true
			end
		end
		d.loaded = ok
	end
	updateStats(plr)
	local list = {}
	for i in pairs(d.shells) do
		table.insert(list, i)
	end
	ShellRemote:FireClient(plr, "state", list)
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
shellFolder.Name = "Conchas"
shellFolder.Parent = workspace

for i, pos in ipairs(Layout.SHELLS) do
	local p = Instance.new("Part")
	p.Name = "Concha" .. i
	p.Shape = Enum.PartType.Ball
	p.Size = Vector3.new(2.6, 2.6, 2.6)
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
		if not d or d.shells[i] then
			return
		end
		d.shells[i] = true
		addMoney(plr, SHELL_REWARD, "Concha dorada encontrada")
		ShellRemote:FireClient(plr, "got", i)
		if plr.leaderstats.Conchas.Value == #Layout.SHELLS then
			addMoney(plr, 10000, "\u{A1}Encontraste TODAS las conchas!")
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
	if action ~= "start" or jobs[plr] or not root then
		return
	end
	local options = {}
	for _, d in ipairs(Layout.DESTINATIONS) do
		if flatDist(d.pos, root.Position) > 200 then
			table.insert(options, d)
		end
	end
	if #options == 0 then
		options = Layout.DESTINATIONS
	end
	local dest = options[math.random(1, #options)]
	local dist = flatDist(dest.pos, root.Position)
	local timeLimit = math.floor(dist / 35 + 25)
	local job = {
		pos = dest.pos,
		name = dest.name,
		reward = math.floor(dist * 1.5 / 10) * 10 + 150,
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
		if root and flatDist(root.Position, job.pos) < 18 then
			jobs[plr] = nil
			local onTime = os.clock() <= job.deadline
			local pay = if onTime then job.reward else math.floor(job.reward / 2)
			addMoney(plr, pay, if onTime then "Entrega a tiempo" else "Entrega tarde (mitad de pago)")
			JobRemote:FireClient(plr, "done", pay, onTime)
		end
	end
end

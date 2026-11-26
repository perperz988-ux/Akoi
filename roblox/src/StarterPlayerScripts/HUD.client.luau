-- HUD: interfaz pensada para movil. Dinero, conchas, nombre del distrito,
-- botones grandes (Coche / Trabajo), mision activa con baliza y velocimetro.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local Layout = require(ReplicatedStorage:WaitForChild("Layout"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local SpawnCar = Remotes:WaitForChild("SpawnCar")
local JobRemote = Remotes:WaitForChild("Job")
local ShellRemote = Remotes:WaitForChild("Shells")
local NotifyRemote = Remotes:WaitForChild("Notify")

local FONT = Enum.Font.FredokaOne
local GOLD = Color3.fromRGB(255, 200, 80)

local gui = Instance.new("ScreenGui")
gui.Name = "PortSolanoHUD"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

local function label(parent, props)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Font = FONT
	l.TextColor3 = Color3.new(1, 1, 1)
	l.TextStrokeTransparency = 0.4
	l.TextScaled = true
	for k, v in pairs(props) do
		l[k] = v
	end
	l.Parent = parent
	return l
end

local function corner(parent, r)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, r or 12)
	c.Parent = parent
end

-- Panel de dinero / conchas (arriba a la izquierda, debajo del menu de Roblox)
local stats = Instance.new("Frame")
stats.Size = UDim2.new(0, 190, 0, 70)
stats.Position = UDim2.new(0, 12, 0, 50)
stats.BackgroundColor3 = Color3.fromRGB(15, 20, 30)
stats.BackgroundTransparency = 0.35
stats.Parent = gui
corner(stats)
local moneyLabel = label(stats, {
	Size = UDim2.new(1, -16, 0.55, 0),
	Position = UDim2.new(0, 8, 0, 4),
	TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = Color3.fromRGB(120, 255, 140),
	Text = "$ 0",
})
local shellLabel = label(stats, {
	Size = UDim2.new(1, -16, 0.38, 0),
	Position = UDim2.new(0, 8, 0.58, 0),
	TextXAlignment = Enum.TextXAlignment.Left,
	TextColor3 = GOLD,
	Text = "Conchas 0/" .. #Layout.SHELLS,
})

local function formatMoney(n)
	local s = tostring(math.floor(n))
	local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	if out:sub(1, 1) == "," then
		out = out:sub(2)
	end
	return "$ " .. out
end

task.spawn(function()
	local ls = player:WaitForChild("leaderstats")
	local money = ls:WaitForChild("Dinero")
	local shells = ls:WaitForChild("Conchas")
	local function refresh()
		moneyLabel.Text = formatMoney(money.Value)
		shellLabel.Text = ("Conchas %d/%d"):format(shells.Value, #Layout.SHELLS)
	end
	money.Changed:Connect(refresh)
	shells.Changed:Connect(refresh)
	refresh()
end)

-- Nombre del distrito (aparece al cambiar de zona)
local districtLabel = label(gui, {
	Size = UDim2.new(0, 420, 0, 44),
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 50),
	Text = "",
	TextTransparency = 1,
	TextStrokeTransparency = 1,
})

-- Notificaciones
local toast = label(gui, {
	Size = UDim2.new(0, 460, 0, 34),
	AnchorPoint = Vector2.new(0.5, 0),
	Position = UDim2.new(0.5, 0, 0, 140),
	TextColor3 = Color3.fromRGB(120, 255, 140),
	Text = "",
	TextTransparency = 1,
	TextStrokeTransparency = 1,
})
local toastId = 0
local function notify(text, color)
	toastId += 1
	local id = toastId
	toast.Text = text
	toast.TextColor3 = color or Color3.fromRGB(120, 255, 140)
	toast.TextTransparency = 0
	toast.TextStrokeTransparency = 0.4
	task.delay(3, function()
		if id == toastId then
			TweenService:Create(toast, TweenInfo.new(0.6), { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
		end
	end)
end
NotifyRemote.OnClientEvent:Connect(function(text)
	notify(text)
end)

-- Botones grandes (derecha, encima del boton de salto del movil)
local function bigButton(text, color, y)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(0, 130, 0, 54)
	b.AnchorPoint = Vector2.new(1, 0.5)
	b.Position = UDim2.new(1, -14, 0.5, y)
	b.BackgroundColor3 = color
	b.Font = FONT
	b.TextScaled = true
	b.TextColor3 = Color3.new(1, 1, 1)
	b.TextStrokeTransparency = 0.5
	b.Text = text
	b.AutoButtonColor = true
	b.Parent = gui
	corner(b, 14)
	local pad = Instance.new("UIPadding")
	pad.PaddingTop = UDim.new(0, 8)
	pad.PaddingBottom = UDim.new(0, 8)
	pad.Parent = b
	return b
end

local carButton = bigButton("Coche", Color3.fromRGB(40, 140, 230), -100)
local jobButton = bigButton("Trabajo", Color3.fromRGB(240, 140, 30), -36)

carButton.Activated:Connect(function()
	SpawnCar:FireServer()
end)

-- Mision de reparto
local jobPanel = Instance.new("Frame")
jobPanel.Size = UDim2.new(0, 380, 0, 54)
jobPanel.AnchorPoint = Vector2.new(0.5, 0)
jobPanel.Position = UDim2.new(0.5, 0, 0, 96)
jobPanel.BackgroundColor3 = Color3.fromRGB(15, 20, 30)
jobPanel.BackgroundTransparency = 0.3
jobPanel.Visible = false
jobPanel.Parent = gui
corner(jobPanel)
local jobTitle = label(jobPanel, {
	Size = UDim2.new(1, -16, 0.5, 0),
	Position = UDim2.new(0, 8, 0, 3),
	TextColor3 = Color3.fromRGB(255, 180, 70),
	Text = "",
})
local jobInfo = label(jobPanel, {
	Size = UDim2.new(1, -16, 0.42, 0),
	Position = UDim2.new(0, 8, 0.52, 0),
	Text = "",
})

local job = nil
local beacon = nil

local function clearJob()
	job = nil
	jobPanel.Visible = false
	jobButton.Text = "Trabajo"
	jobButton.BackgroundColor3 = Color3.fromRGB(240, 140, 30)
	if beacon then
		beacon:Destroy()
		beacon = nil
	end
end

jobButton.Activated:Connect(function()
	JobRemote:FireServer(if job then "cancel" else "start")
end)

JobRemote.OnClientEvent:Connect(function(kind, a, b, c, d)
	if kind == "start" then
		clearJob()
		job = { name = a, pos = b, reward = c, deadline = os.clock() + d }
		jobTitle.Text = "Entrega: " .. a .. "  ($" .. c .. ")"
		jobPanel.Visible = true
		jobButton.Text = "Cancelar"
		jobButton.BackgroundColor3 = Color3.fromRGB(170, 60, 60)
		-- baliza solo visible para ti
		beacon = Instance.new("Part")
		beacon.Name = "BalizaEntrega"
		beacon.Anchored = true
		beacon.CanCollide = false
		beacon.CanQuery = false
		beacon.CanTouch = false
		beacon.Shape = Enum.PartType.Cylinder
		beacon.Size = Vector3.new(300, 14, 14)
		beacon.CFrame = CFrame.new(b + Vector3.new(0, 150, 0)) * CFrame.Angles(0, 0, math.rad(90))
		beacon.Material = Enum.Material.Neon
		beacon.Color = Color3.fromRGB(255, 170, 40)
		beacon.Transparency = 0.55
		local bb = Instance.new("BillboardGui")
		bb.AlwaysOnTop = true
		bb.Size = UDim2.new(0, 160, 0, 40)
		bb.StudsOffsetWorldSpace = Vector3.new(0, -140, 0)
		bb.Adornee = beacon
		local t = label(bb, { Size = UDim2.fromScale(1, 1), Text = "ENTREGA", TextColor3 = Color3.fromRGB(255, 190, 70) })
		t.Name = "Text"
		bb.Parent = beacon
		beacon.Parent = workspace
		notify("Nuevo trabajo: lleva el paquete a " .. a, Color3.fromRGB(255, 190, 70))
	elseif kind == "done" then
		clearJob()
	elseif kind == "cancel" then
		clearJob()
		notify("Trabajo cancelado", Color3.fromRGB(255, 120, 120))
	end
end)

-- Velocimetro
local speedo = label(gui, {
	Size = UDim2.new(0, 220, 0, 50),
	AnchorPoint = Vector2.new(0.5, 1),
	Position = UDim2.new(0.5, 0, 1, -20),
	TextColor3 = Color3.new(1, 1, 1),
	Text = "",
	Visible = false,
})

-- Conchas: ocultar las que ya tienes y hacerlas girar
local collected = {}
local shellFolder = workspace:WaitForChild("Conchas", 60)
local function hideShell(i)
	collected[i] = true
	if not shellFolder then
		return
	end
	local p = shellFolder:FindFirstChild("Concha" .. i)
	if p then
		p.Transparency = 1
		local l = p:FindFirstChildOfClass("PointLight")
		if l then
			l.Enabled = false
		end
		local s = p:FindFirstChildOfClass("Sparkles")
		if s then
			s.Enabled = false
		end
	end
end
ShellRemote.OnClientEvent:Connect(function(kind, data)
	if kind == "state" then
		for _, i in ipairs(data) do
			hideShell(i)
		end
	elseif kind == "got" then
		hideShell(data)
	end
end)

-- Bucle de interfaz
local lastDistrict = nil
local districtTween = nil
local bob = 0
RunService.RenderStepped:Connect(function(dt)
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if root then
		local pos = root.Position
		local district = Layout.districtAt(pos.X, pos.Z)
		if district ~= lastDistrict then
			lastDistrict = district
			districtLabel.Text = district.name
			districtLabel.TextColor3 = district.color
			districtLabel.TextTransparency = 0
			districtLabel.TextStrokeTransparency = 0.3
			if districtTween then
				districtTween:Cancel()
			end
			districtTween = TweenService:Create(districtLabel, TweenInfo.new(1.2, Enum.EasingStyle.Quad, Enum.EasingDirection.In, 0, false, 2.5), { TextTransparency = 1, TextStrokeTransparency = 1 })
			districtTween:Play()
		end
		if job then
			local flat = Vector3.new(job.pos.X - pos.X, 0, job.pos.Z - pos.Z)
			local left = math.max(0, math.ceil(job.deadline - os.clock()))
			jobInfo.Text = ("%d m   |   %d:%02d"):format(math.floor(flat.Magnitude * 0.28), left // 60, left % 60)
			jobInfo.TextColor3 = if left > 0 then Color3.new(1, 1, 1) else Color3.fromRGB(255, 110, 110)
		end
	end

	local speed = player:GetAttribute("CarSpeed")
	if speed then
		speedo.Visible = true
		speedo.Text = ("%d km/h"):format(math.floor(speed))
	else
		speedo.Visible = false
	end

	if shellFolder then
		bob += dt
		for _, p in ipairs(shellFolder:GetChildren()) do
			local i = p:GetAttribute("Index")
			if i and not collected[i] then
				local base = Layout.SHELLS[i]
				p.CFrame = CFrame.new(base + Vector3.new(0, math.sin(bob * 2 + i) * 0.5, 0)) * CFrame.Angles(0, bob * 2, 0)
			end
		end
	end
end)

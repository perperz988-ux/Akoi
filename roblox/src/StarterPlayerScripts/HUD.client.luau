-- HUD: el mismo HUD que src/ui/Hud.ts + style.css del original.
--  Arriba izquierda: minimapa redondo (rumbo arriba) + chip de lugar (distrito · calle),
--  chip de reloj y barras de vida / armadura / estamina.
--  Arriba derecha: dinero verde con +/- animado, 5 estrellas de busqueda y velocimetro.
--  Centro arriba: avisos (toasts). Izquierda: objetivo. Botones grandes para el movil.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Lighting = game:GetService("Lighting")

local player = Players.LocalPlayer
local Layout = require(ReplicatedStorage:WaitForChild("Layout"))
local Remotes = ReplicatedStorage:WaitForChild("Remotes")
local SpawnCar = Remotes:WaitForChild("SpawnCar")
local JobRemote = Remotes:WaitForChild("Job")
local ShellRemote = Remotes:WaitForChild("Shells")
local NotifyRemote = Remotes:WaitForChild("Notify")
local SC = Layout.SCALE

-- colores de style.css
local PANEL = Color3.fromRGB(14, 18, 26)
local PANEL2 = Color3.fromRGB(26, 32, 44)
local TXT = Color3.fromRGB(0xee, 0xf2, 0xf8)
local DIM = Color3.fromRGB(0x9a, 0xa7, 0xbb)
local ACCENT = Color3.fromRGB(0xff, 0xd1, 0x66)
local GOOD = Color3.fromRGB(0x4a, 0xde, 0x80)
local BAD = Color3.fromRGB(0xff, 0x4d, 0x6d)
local MONEY = Color3.fromRGB(0xc9, 0xf7, 0xd0)
local BOLD, REG = Enum.Font.GothamBold, Enum.Font.Gotham

_G.PS = _G.PS or {}

local gui = Instance.new("ScreenGui")
gui.Name = "PortSolanoHUD"
gui.ResetOnSpawn = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Enabled = player:GetAttribute("InGame") == true
gui.Parent = player:WaitForChild("PlayerGui")
player:GetAttributeChangedSignal("InGame"):Connect(function()
	gui.Enabled = player:GetAttribute("InGame") == true
end)

local function corner(o, r)
	local c = Instance.new("UICorner")
	c.CornerRadius = r or UDim.new(0, 10)
	c.Parent = o
end
local function stroke(o, t)
	local s = Instance.new("UIStroke")
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Color = Color3.new(1, 1, 1)
	s.Transparency = t or 0.88
	s.Parent = o
	return s
end
local function label(parent, props)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Font = BOLD
	l.TextColor3 = TXT
	for k, v in pairs(props) do
		l[k] = v
	end
	l.Parent = parent
	return l
end
local function shadowText(l)
	l.TextStrokeColor3 = Color3.new(0, 0, 0)
	l.TextStrokeTransparency = 0.55
end

----------------------------------------------------------------------
-- Arriba a la izquierda: minimapa + informacion
----------------------------------------------------------------------
local topLeft = Instance.new("Frame")
topLeft.BackgroundTransparency = 1
topLeft.Position = UDim2.new(0, 12, 0, 10)
topLeft.Size = UDim2.new(0, 400, 0, 140)
topLeft.Parent = gui

local mini = Instance.new("CanvasGroup")
mini.Size = UDim2.fromOffset(132, 132)
mini.BackgroundColor3 = Color3.fromRGB(10, 14, 21)
mini.Parent = topLeft
corner(mini, UDim.new(0.5, 0))
local miniStroke = stroke(mini, 0.8)
miniStroke.Thickness = 2
local rot = Instance.new("Frame")
rot.AnchorPoint = Vector2.new(0.5, 0.5)
rot.Position = UDim2.fromScale(0.5, 0.5)
rot.Size = UDim2.fromOffset(0, 0)
rot.BackgroundTransparency = 1
rot.Parent = mini
local pan = Instance.new("Frame")
pan.Size = UDim2.fromOffset(0, 0)
pan.BackgroundTransparency = 1
pan.Parent = rot
local arrow = label(topLeft, { Size = UDim2.fromOffset(20, 20), Position = UDim2.fromOffset(56, 54), Text = "▲", TextSize = 16, TextColor3 = Color3.new(1, 1, 1) })
shadowText(arrow)
local blipDot = Instance.new("Frame")
blipDot.Size = UDim2.fromOffset(10, 10)
blipDot.AnchorPoint = Vector2.new(0.5, 0.5)
blipDot.BackgroundColor3 = ACCENT
blipDot.Visible = false
blipDot.ZIndex = 5
blipDot.Parent = mini
corner(blipDot, UDim.new(1, 0))
stroke(blipDot, 0).Color = Color3.new(0, 0, 0)
local copDots = {}
for i = 1, 8 do
	local d = Instance.new("Frame")
	d.Size = UDim2.fromOffset(7, 7)
	d.AnchorPoint = Vector2.new(0.5, 0.5)
	d.BackgroundColor3 = Color3.fromHex("#4d8dff")
	d.Visible = false
	d.ZIndex = 5
	d.Parent = mini
	corner(d, UDim.new(1, 0))
	copDots[i] = d
end

local info = Instance.new("Frame")
info.BackgroundTransparency = 1
info.Position = UDim2.fromOffset(142, 0)
info.Size = UDim2.fromOffset(240, 120)
info.Parent = topLeft
local infoList = Instance.new("UIListLayout")
infoList.Padding = UDim.new(0, 5)
infoList.SortOrder = Enum.SortOrder.LayoutOrder
infoList.Parent = info

local function chip(order)
	local f = Instance.new("TextLabel")
	f.LayoutOrder = order
	f.AutomaticSize = Enum.AutomaticSize.X
	f.Size = UDim2.fromOffset(0, 22)
	f.BackgroundColor3 = PANEL
	f.BackgroundTransparency = 0.28
	f.Font = REG
	f.TextSize = 12
	f.TextColor3 = TXT
	f.RichText = true
	f.Text = ""
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 9)
	pad.PaddingRight = UDim.new(0, 9)
	pad.Parent = f
	corner(f)
	stroke(f)
	f.Parent = info
	return f
end
local placeChip = chip(1)
local clockChip = chip(2)

local function bar(order, c1, c2)
	local b = Instance.new("Frame")
	b.LayoutOrder = order
	b.Size = UDim2.fromOffset(120, 7)
	b.BackgroundColor3 = Color3.new(1, 1, 1)
	b.BackgroundTransparency = 0.88
	b.ClipsDescendants = true
	corner(b, UDim.new(0, 5))
	local fill = Instance.new("Frame")
	fill.Size = UDim2.fromScale(1, 1)
	fill.BackgroundColor3 = Color3.new(1, 1, 1)
	fill.BorderSizePixel = 0
	corner(fill, UDim.new(0, 5))
	local g = Instance.new("UIGradient")
	g.Color = ColorSequence.new(c1, c2 or c1)
	g.Parent = fill
	fill.Parent = b
	b.Parent = info
	return fill
end
local hpBar = bar(3, BAD, Color3.fromRGB(0xff, 0x9a, 0x5c))
local arBar = bar(4, Color3.fromRGB(0x38, 0xbd, 0xf8))
local stBar = bar(5, Color3.fromRGB(0xfa, 0xcc, 0x15))

----------------------------------------------------------------------
-- Arriba a la derecha: dinero, estrellas, velocimetro
----------------------------------------------------------------------
local topRight = Instance.new("Frame")
topRight.BackgroundTransparency = 1
topRight.AnchorPoint = Vector2.new(1, 0)
topRight.Position = UDim2.new(1, -12, 0, 10)
topRight.Size = UDim2.fromOffset(240, 200)
topRight.Parent = gui
local moneyLabel = label(topRight, { Size = UDim2.new(1, 0, 0, 26), TextSize = 22, TextColor3 = MONEY, TextXAlignment = Enum.TextXAlignment.Right, Text = "$0" })
shadowText(moneyLabel)
local deltaLabel = label(topRight, { Position = UDim2.fromOffset(0, 28), Size = UDim2.new(1, 0, 0, 16), TextSize = 14, TextXAlignment = Enum.TextXAlignment.Right, Text = "", TextTransparency = 1 })
local starsLabel = label(topRight, { Position = UDim2.fromOffset(0, 46), Size = UDim2.new(1, 0, 0, 24), TextSize = 22, RichText = true, TextXAlignment = Enum.TextXAlignment.Right, Text = "" })
shadowText(starsLabel)

local speedo = Instance.new("Frame")
speedo.BackgroundTransparency = 1
speedo.Position = UDim2.fromOffset(0, 108)
speedo.Size = UDim2.new(1, 0, 0, 70)
speedo.Visible = false
speedo.Parent = topRight
local kmh = label(speedo, { Size = UDim2.new(1, 0, 0, 34), TextSize = 34, Font = Enum.Font.GothamBlack, TextXAlignment = Enum.TextXAlignment.Right, Text = "0" })
shadowText(kmh)
local unitL = label(speedo, { Position = UDim2.fromOffset(0, 34), Size = UDim2.new(1, 0, 0, 16), TextSize = 12, Font = REG, TextColor3 = DIM, RichText = true, TextXAlignment = Enum.TextXAlignment.Right, Text = "km/h" })
local vehName = label(speedo, { Position = UDim2.fromOffset(0, 50), Size = UDim2.new(1, 0, 0, 16), TextSize = 12, Font = REG, TextColor3 = DIM, TextXAlignment = Enum.TextXAlignment.Right, Text = "" })

----------------------------------------------------------------------
-- Toasts (avisos), objetivo y botones
----------------------------------------------------------------------
local toasts = Instance.new("Frame")
toasts.BackgroundTransparency = 1
toasts.AnchorPoint = Vector2.new(0.5, 0)
toasts.Position = UDim2.new(0.5, 0, 0, 64)
toasts.Size = UDim2.fromOffset(500, 200)
toasts.Parent = gui
local tl = Instance.new("UIListLayout")
tl.HorizontalAlignment = Enum.HorizontalAlignment.Center
tl.Padding = UDim.new(0, 6)
tl.Parent = toasts

local function toast(text, ttl)
	local t = Instance.new("TextLabel")
	t.AutomaticSize = Enum.AutomaticSize.X
	t.Size = UDim2.fromOffset(0, 30)
	t.BackgroundColor3 = PANEL2
	t.BackgroundTransparency = 0.18
	t.Font = REG
	t.TextSize = 14
	t.RichText = true
	t.TextColor3 = TXT
	t.Text = text
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 14)
	pad.PaddingRight = UDim.new(0, 14)
	pad.Parent = t
	corner(t, UDim.new(0, 15))
	stroke(t)
	t.Parent = toasts
	task.delay(ttl or 3, function()
		TweenService:Create(t, TweenInfo.new(0.4), { BackgroundTransparency = 1, TextTransparency = 1 }):Play()
		task.wait(0.45)
		t:Destroy()
	end)
end
_G.PS.toast = toast

local moneyShown, moneyDeltaT = 0, 0
NotifyRemote.OnClientEvent:Connect(function(text)
	toast(text)
end)

local objective = Instance.new("Frame")
objective.Position = UDim2.fromOffset(12, 152)
objective.Size = UDim2.fromOffset(240, 46)
objective.BackgroundColor3 = PANEL
objective.BackgroundTransparency = 0.28
objective.Visible = false
objective.Parent = gui
corner(objective, UDim.new(0, 8))
stroke(objective)
local objBar = Instance.new("Frame")
objBar.Size = UDim2.new(0, 3, 1, 0)
objBar.BackgroundColor3 = ACCENT
objBar.BorderSizePixel = 0
objBar.Parent = objective
local objT = label(objective, { Position = UDim2.fromOffset(12, 4), Size = UDim2.new(1, -20, 0, 14), TextSize = 11, TextColor3 = ACCENT, TextXAlignment = Enum.TextXAlignment.Left, Text = "" })
local objX = label(objective, { Position = UDim2.fromOffset(12, 19), Size = UDim2.new(1, -20, 0, 22), TextSize = 14, Font = REG, TextXAlignment = Enum.TextXAlignment.Left, TextTruncate = Enum.TextTruncate.AtEnd, Text = "" })
local function setObjective(title, text)
	objective.Visible = title ~= "" or text ~= ""
	objT.Text = string.upper(title)
	objX.Text = text
end
_G.PS.setObjective = setObjective

local function btn(text, y, primary)
	local b = Instance.new("TextButton")
	b.AnchorPoint = Vector2.new(1, 0.5)
	b.Position = UDim2.new(1, -14, 0.5, y)
	b.Size = UDim2.fromOffset(120, 46)
	b.BackgroundColor3 = if primary then ACCENT else Color3.new(1, 1, 1)
	b.BackgroundTransparency = if primary then 0 else 0.85
	b.Font = BOLD
	b.TextSize = 15
	b.TextColor3 = if primary then Color3.fromRGB(17, 17, 17) else Color3.new(1, 1, 1)
	b.Text = text
	corner(b, UDim.new(0, 12))
	stroke(b)
	b.Parent = gui
	return b
end
local carButton = btn("🚗 Car", -96)
local jobButton = btn("💼 Job", -40, true)
local function updateFreeRoam()
	jobButton.Visible = player:GetAttribute("FreeRoam") ~= true
end
updateFreeRoam()
player:GetAttributeChangedSignal("FreeRoam"):Connect(updateFreeRoam)
carButton.Activated:Connect(function()
	SpawnCar:FireServer()
end)

----------------------------------------------------------------------
-- Trabajo de reparto (baliza + objetivo)
----------------------------------------------------------------------
local job, beacon = nil, nil
local function clearJob()
	job = nil
	setObjective("", "")
	jobButton.Text = "💼 Job"
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
		jobButton.Text = "✖ Cancel"
		beacon = Instance.new("Part")
		beacon.Anchored = true
		beacon.CanCollide = false
		beacon.CanQuery = false
		beacon.CanTouch = false
		beacon.Shape = Enum.PartType.Cylinder
		beacon.Size = Vector3.new(300, 10, 10)
		beacon.CFrame = CFrame.new(b + Vector3.new(0, 150, 0)) * CFrame.Angles(0, 0, math.rad(90))
		beacon.Material = Enum.Material.Neon
		beacon.Color = ACCENT
		beacon.Transparency = 0.6
		beacon.Parent = workspace
		toast(("<b><font color=\"#ffd166\">JOB</font></b> · Deliver to %s ($%d)"):format(a, c), 4)
	elseif kind == "done" then
		clearJob()
	elseif kind == "cancel" then
		clearJob()
		toast("Job cancelled")
	end
end)

----------------------------------------------------------------------
-- Paquetes ocultos (girando; se ocultan los ya recogidos)
----------------------------------------------------------------------
local collected = {}
local shellFolder = nil
local function hideShell(i)
	collected[i] = true
	local p = shellFolder and shellFolder:FindFirstChild("Paquete" .. i)
	if p then
		p.Transparency = 1
		for _, c in ipairs(p:GetChildren()) do
			if c:IsA("PointLight") or c:IsA("Sparkles") then
				c.Enabled = false
			end
		end
	end
end
ShellRemote.OnClientEvent:Connect(function(kind, data)
	if kind == "state" then
		table.clear(collected)
		if shellFolder then
			for _, p in ipairs(shellFolder:GetChildren()) do
				p.Transparency = 0
			end
		end
		for _, i in ipairs(data) do
			hideShell(i)
		end
	elseif kind == "got" then
		hideShell(data)
	end
end)
task.spawn(function()
	shellFolder = workspace:WaitForChild("Paquetes", 120)
end)

----------------------------------------------------------------------
-- Minimapa (colores de MapRender.ts)
----------------------------------------------------------------------
local DCOL = {
	[0] = "#2b3140", [1] = "#272d3a", [2] = "#2a3a33", [3] = "#36322e", [4] = "#6d6248", [5] = "#24372a", [6] = "#33292b",
	[7] = "#2e2e32", [8] = "#3a3342", [9] = "#2f3a2d", [10] = "#2f3b25", [11] = "#2f5a33", [12] = "#16446a", [13] = "#0f3556",
	[14] = "#6d6248", [15] = "#2f5a4a",
}
local ZOOM_M = 200 -- metros del centro al borde
local K = 66 / ZOOM_M -- px por metro
local builtAt = nil
local function rebuildMap(pos)
	for _, c in ipairs(pan:GetChildren()) do
		c:Destroy()
	end
	builtAt = pos
	local cx, cz = pos.X / SC, pos.Z / SC
	local ci0 = math.floor((cx + 1600) / 100)
	local cj0 = math.floor((cz + 1600) / 100)
	for ci = ci0 - 5, ci0 + 5 do
		for cj = cj0 - 5, cj0 + 5 do
			local x0, z0 = -1600 + ci * 100, -1600 + cj * 100
			local id = Layout.districtIdAt((x0 + 50) * SC, (z0 + 50) * SC)
			local f = Instance.new("Frame")
			f.BorderSizePixel = 0
			f.BackgroundColor3 = Color3.fromHex(DCOL[id] or "#2a2f3a")
			f.Position = UDim2.fromOffset((x0 - cx) * K, (z0 - cz) * K)
			f.Size = UDim2.fromOffset(100 * K + 1, 100 * K + 1)
			f.Parent = pan
		end
	end
	for _, r in ipairs(Layout.ROADS) do
		local a, b = Layout.nodePos(r.a) / SC, Layout.nodePos(r.b) / SC
		if math.abs((a.X + b.X) / 2 - cx) < 520 and math.abs((a.Z + b.Z) / 2 - cz) < 520 then
			local w = if r.hwy then 3.2 else 1.9
			local f = Instance.new("Frame")
			f.BorderSizePixel = 0
			f.BackgroundColor3 = Color3.fromHex(if r.hwy then "#e7b04a" else "#9aa4b4")
			local x0, z0 = math.min(a.X, b.X), math.min(a.Z, b.Z)
			local wx = if r.axis == 0 then w else 100 * K
			local wz = if r.axis == 0 then 100 * K else w
			f.Position = UDim2.fromOffset((x0 - cx) * K - (if r.axis == 0 then w / 2 else 0), (z0 - cz) * K - (if r.axis == 1 then w / 2 else 0))
			f.Size = UDim2.fromOffset(wx, wz)
			f.ZIndex = 2
			f.Parent = pan
		end
	end
end

-- punto en el minimapa (pegado al borde si esta lejos)
local function placeDot(dot, worldPos, p, ang)
	local rel = (worldPos - p) / SC
	local x = rel.X * math.cos(ang) - rel.Z * math.sin(ang)
	local y = rel.X * math.sin(ang) + rel.Z * math.cos(ang)
	local d = math.sqrt(x * x + y * y) * K
	local scale = if d > 58 then 58 / d else 1
	dot.Position = UDim2.fromOffset(66 + x * K * scale, 66 + y * K * scale)
	dot.Visible = true
	return rel.Magnitude
end

----------------------------------------------------------------------
-- Bucle
----------------------------------------------------------------------
local function formatMoney(n)
	local s = tostring(math.floor(math.abs(n)))
	local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	if out:sub(1, 1) == "," then
		out = out:sub(2)
	end
	return "$" .. out
end

local moneyValue = nil
task.spawn(function()
	local ls = player:WaitForChild("leaderstats")
	moneyValue = ls:WaitForChild("Dinero")
	moneyShown = moneyValue.Value
	local last = moneyValue.Value
	moneyValue.Changed:Connect(function(v)
		local d = v - last
		last = v
		if d ~= 0 and player:GetAttribute("InGame") then
			moneyDeltaT = 2.5
			deltaLabel.Text = (if d >= 0 then "+" else "−") .. formatMoney(d)
			deltaLabel.TextColor3 = if d >= 0 then GOOD else BAD
		end
	end)
end)

local bob = 0
RunService.RenderStepped:Connect(function(dt)
	if not gui.Enabled then
		return
	end
	local char = player.Character
	local root = char and char:FindFirstChild("HumanoidRootPart")
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local cam = workspace.CurrentCamera

	-- dinero (cuenta animada como el original)
	if moneyValue then
		moneyShown += (moneyValue.Value - moneyShown) * math.min(1, dt * 8)
		moneyLabel.Text = formatMoney(math.floor(moneyShown + 0.5))
	end
	if moneyDeltaT > 0 then
		moneyDeltaT -= dt
		deltaLabel.TextTransparency = 0
	else
		deltaLabel.TextTransparency = 1
	end

	-- estrellas de busqueda (parpadean si la policia te busca pero no te ve)
	local wanted = player:GetAttribute("Wanted") or 0
	local seen = player:GetAttribute("WantedSeen") ~= false
	local blinkOff = wanted > 0 and not seen and (os.clock() % 0.6) > 0.3
	local s = ""
	for i = 1, 5 do
		local on = i <= wanted and not blinkOff
		s ..= ('<font color="%s">★</font>'):format(if on then "#ffd23f" else "#5f6670")
	end
	starsLabel.Text = s

	-- vida / armadura / estamina
	if hum then
		hpBar.Size = UDim2.fromScale(math.clamp(hum.Health / math.max(1, hum.MaxHealth), 0, 1), 1)
	end
	arBar.Size = UDim2.fromScale(math.clamp((player:GetAttribute("Armor") or 0) / 100, 0, 1), 1)
	stBar.Size = UDim2.fromScale(math.clamp((player:GetAttribute("Stamina") or 100) / 100, 0, 1), 1)

	-- reloj y lugar
	local t = Lighting.ClockTime
	clockChip.Text = ("%02d:%02d · Day %d"):format(math.floor(t), math.floor((t % 1) * 60), workspace:GetAttribute("Day") or 1)
	if root then
		local p = root.Position
		placeChip.Text = ("<b><font color=\"#ffd166\">%s</font></b> · %s"):format(Layout.districtAt(p.X, p.Z).name, Layout.streetName(p.X, p.Z))

		-- minimapa: rumbo arriba
		if not builtAt or (Vector3.new(p.X, 0, p.Z) - builtAt).Magnitude > 250 * SC then
			rebuildMap(Vector3.new(p.X, 0, p.Z))
		end
		local look = cam.CFrame.LookVector
		local heading = math.deg(math.atan2(look.Z, look.X))
		rot.Rotation = -90 - heading
		pan.Position = UDim2.fromOffset(-(p.X - builtAt.X) / SC * K, -(p.Z - builtAt.Z) / SC * K)
		local ang = math.rad(rot.Rotation)

		if job then
			local dist = placeDot(blipDot, job.pos, p, ang)
			local left = math.max(0, math.ceil(job.deadline - os.clock()))
			setObjective("Delivery", ("%s · %d m · %d:%02d"):format(job.name, math.floor(dist), left // 60, left % 60))
		else
			blipDot.Visible = false
		end
		-- policias cercanos (puntos azules)
		local cops = _G.PS.cops or {}
		for i, d in ipairs(copDots) do
			local c = cops[i]
			if c and c.pos then
				placeDot(d, c.pos, p, ang)
			else
				d.Visible = false
			end
		end
	end

	-- velocimetro
	local speed = player:GetAttribute("CarSpeed")
	local seat = hum and hum.SeatPart
	if speed and seat then
		speedo.Visible = true
		local v = speed / SC * 3.6
		kmh.Text = tostring(math.floor(v + 0.5))
		local gear = if v < 1 then "N" elseif player:GetAttribute("CarReverse") then "R" else tostring(math.clamp(math.floor(v / 35) + 1, 1, 6))
		unitL.Text = ('km/h · <font color="#ffd166"><b>%s</b></font>'):format(gear)
		vehName.Text = seat.Parent and seat.Parent.Name or ""
	else
		speedo.Visible = false
	end

	-- paquetes girando
	if shellFolder then
		bob += dt
		for _, pk in ipairs(shellFolder:GetChildren()) do
			local i = pk:GetAttribute("Index")
			if i and not collected[i] then
				local base = Layout.SHELLS[i]
				pk.CFrame = CFrame.new(base + Vector3.new(0, math.sin(bob * 2 + i) * 0.5, 0)) * CFrame.Angles(0, bob * 2, 0)
			elseif i and pk.Transparency < 1 then
				hideShell(i)
			end
		end
	end
end)

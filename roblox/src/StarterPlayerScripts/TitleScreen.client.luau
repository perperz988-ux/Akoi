-- TitleScreen: el menu de inicio de Port Solano, igual que el juego original:
-- la camara gira despacio sobre Downtown, degradado oscuro a la izquierda,
-- "PORT / SOLANO" en grande y los botones Continue / New Game / Free Roam / Load Game / Settings.
-- Los 3 slots de guardado se eligen en un panel como en el original.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local Layout = require(ReplicatedStorage:WaitForChild("Layout"))
local SlotsRemote = ReplicatedStorage:WaitForChild("Remotes"):WaitForChild("Slots")

local ACCENT = Color3.fromRGB(0xff, 0xd1, 0x66)
local DIM = Color3.fromRGB(0x9a, 0xa7, 0xbb)
local TXT = Color3.fromRGB(0xee, 0xf2, 0xf8)
local SC = Layout.SCALE

-- controles del jugador (se desactivan mientras esta el menu)
local controls = nil
pcall(function()
	controls = require(player:WaitForChild("PlayerScripts"):WaitForChild("PlayerModule")):GetControls()
end)

----------------------------------------------------------------------
-- Interfaz
----------------------------------------------------------------------
local gui = Instance.new("ScreenGui")
gui.Name = "PortSolanoTitle"
gui.IgnoreGuiInset = true
gui.ResetOnSpawn = false
gui.DisplayOrder = 50
gui.Parent = player:WaitForChild("PlayerGui")

local root = Instance.new("Frame")
root.Size = UDim2.fromScale(1, 1)
root.BackgroundColor3 = Color3.fromRGB(2, 4, 8)
root.BorderSizePixel = 0
root.Parent = gui
local grad = Instance.new("UIGradient")
grad.Transparency = NumberSequence.new({
	NumberSequenceKeypoint.new(0, 0.15),
	NumberSequenceKeypoint.new(0.55, 0.8),
	NumberSequenceKeypoint.new(1, 1),
})
grad.Parent = root

-- columna izquierda abajo (tamano de referencia: 560 px de alto)
local col = Instance.new("Frame")
col.AnchorPoint = Vector2.new(0, 1)
col.Position = UDim2.new(0, 36, 1, -24)
col.Size = UDim2.new(0, 460, 0, 520)
col.BackgroundTransparency = 1
col.Parent = root
local scale = Instance.new("UIScale")
scale.Parent = col
local list = Instance.new("UIListLayout")
list.VerticalAlignment = Enum.VerticalAlignment.Bottom
list.SortOrder = Enum.SortOrder.LayoutOrder
list.Padding = UDim.new(0, 8)
list.Parent = col

local function updateScale()
	local cam = workspace.CurrentCamera
	if cam then
		scale.Scale = math.clamp(cam.ViewportSize.Y / 600, 0.55, 1.4)
	end
end
updateScale()
workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(updateScale)

local order = 0
local function text(props)
	order += 1
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.LayoutOrder = order
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextColor3 = TXT
	for k, v in pairs(props) do
		l[k] = v
	end
	l.Parent = col
	return l
end

local h1 = text({ Size = UDim2.new(1, 0, 0, 160), Font = Enum.Font.GothamBlack, TextSize = 84, RichText = true, LineHeight = 0.95,
	TextYAlignment = Enum.TextYAlignment.Bottom, Text = 'PORT\n<font color="#ffd166">SOLANO</font>' })
local shadow = Instance.new("UIStroke")
shadow.Color = Color3.new(0, 0, 0)
shadow.Transparency = 0.6
shadow.Thickness = 2
shadow.Parent = h1
text({ Size = UDim2.new(0, 420, 0, 44), Font = Enum.Font.Gotham, TextSize = 15, TextWrapped = true, TextColor3 = DIM,
	TextYAlignment = Enum.TextYAlignment.Top,
	Text = "An open-world crime saga on the Florida-style coast. Original story, original city — drive, fight, build your empire." })

order += 1
local menu = Instance.new("Frame")
menu.LayoutOrder = order
menu.Size = UDim2.new(0, 300, 0, 0)
menu.AutomaticSize = Enum.AutomaticSize.Y
menu.BackgroundTransparency = 1
menu.Parent = col
local mlist = Instance.new("UIListLayout")
mlist.SortOrder = Enum.SortOrder.LayoutOrder
mlist.Padding = UDim.new(0, 8)
mlist.Parent = menu

text({ Size = UDim2.new(1, 0, 0, 22), Font = Enum.Font.Gotham, TextSize = 11, TextColor3 = DIM, Text = "Roblox edition · v1.0" })

local function button(parent, label, primary, onClick, width)
	local b = Instance.new("TextButton")
	b.Size = UDim2.new(0, width or 260, 0, 42)
	b.AutomaticSize = Enum.AutomaticSize.X
	b.BackgroundColor3 = if primary then ACCENT else Color3.new(1, 1, 1)
	b.BackgroundTransparency = if primary then 0 else 0.9
	b.Font = Enum.Font.GothamBold
	b.TextSize = 17
	b.TextColor3 = if primary then Color3.fromRGB(17, 17, 17) else Color3.new(1, 1, 1)
	b.Text = label
	b.AutoButtonColor = true
	Instance.new("UICorner", b).CornerRadius = UDim.new(0, 12)
	local stroke = Instance.new("UIStroke")
	stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	stroke.Color = if primary then ACCENT else Color3.new(1, 1, 1)
	stroke.Transparency = if primary then 0 else 0.88
	stroke.Parent = b
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 18)
	pad.PaddingRight = UDim.new(0, 18)
	pad.Parent = b
	b.Activated:Connect(onClick)
	b.Parent = parent
	return b
end

----------------------------------------------------------------------
-- Panel (slots / ajustes), como .panel del original
----------------------------------------------------------------------
local overlay = Instance.new("Frame")
overlay.Size = UDim2.fromScale(1, 1)
overlay.BackgroundColor3 = Color3.new(0, 0, 0)
overlay.BackgroundTransparency = 0.45
overlay.Visible = false
overlay.ZIndex = 10
overlay.Parent = gui

local panel = Instance.new("Frame")
panel.AnchorPoint = Vector2.new(0.5, 0.5)
panel.Position = UDim2.fromScale(0.5, 0.5)
panel.Size = UDim2.new(0, 440, 0, 340)
panel.BackgroundColor3 = Color3.fromRGB(14, 18, 26)
panel.BackgroundTransparency = 0.15
panel.ZIndex = 11
panel.Parent = overlay
Instance.new("UICorner", panel).CornerRadius = UDim.new(0, 14)
local pstroke = Instance.new("UIStroke")
pstroke.Color = Color3.new(1, 1, 1)
pstroke.Transparency = 0.88
pstroke.Parent = panel
local pscale = Instance.new("UIScale")
pscale.Parent = panel
local function updatePanelScale()
	local v = workspace.CurrentCamera.ViewportSize
	pscale.Scale = math.clamp(math.min(v.Y / 420, v.X / 520), 0.55, 1.3)
end
updatePanelScale()
workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(updatePanelScale)

local function panelLabel(props)
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextColor3 = TXT
	l.ZIndex = 12
	for k, v in pairs(props) do
		l[k] = v
	end
	l.Parent = panel
	return l
end
local pTitle = panelLabel({ Position = UDim2.new(0, 16, 0, 12), Size = UDim2.new(1, -32, 0, 26), Font = Enum.Font.GothamBold, TextSize = 20 })
local pSub = panelLabel({ Position = UDim2.new(0, 16, 0, 40), Size = UDim2.new(1, -32, 0, 16), Font = Enum.Font.Gotham, TextSize = 12, TextColor3 = DIM })
local body = Instance.new("Frame")
body.Position = UDim2.new(0, 12, 0, 64)
body.Size = UDim2.new(1, -24, 1, -120)
body.BackgroundTransparency = 1
body.ZIndex = 12
body.Parent = panel
local blist = Instance.new("UIListLayout")
blist.Padding = UDim.new(0, 6)
blist.SortOrder = Enum.SortOrder.LayoutOrder
blist.Parent = body
local closeBtn = button(panel, "Close", false, function()
	overlay.Visible = false
end, 90)
closeBtn.AnchorPoint = Vector2.new(1, 1)
closeBtn.Position = UDim2.new(1, -14, 1, -12)
closeBtn.Size = UDim2.new(0, 90, 0, 38)
closeBtn.ZIndex = 12

local function clearBody()
	for _, c in ipairs(body:GetChildren()) do
		if not c:IsA("UIListLayout") then
			c:Destroy()
		end
	end
end

local function row(label, sub, onClick, n)
	local r = Instance.new("TextButton")
	r.LayoutOrder = n
	r.Size = UDim2.new(1, 0, 0, 52)
	r.BackgroundColor3 = Color3.new(1, 1, 1)
	r.BackgroundTransparency = 0.94
	r.AutoButtonColor = onClick ~= nil
	r.Text = ""
	r.ZIndex = 12
	Instance.new("UICorner", r).CornerRadius = UDim.new(0, 10)
	local s = Instance.new("UIStroke")
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Color = Color3.new(1, 1, 1)
	s.Transparency = 0.88
	s.Parent = r
	local a = Instance.new("TextLabel")
	a.BackgroundTransparency = 1
	a.Position = UDim2.new(0, 12, 0, 7)
	a.Size = UDim2.new(1, -24, 0, 20)
	a.Font = Enum.Font.GothamBold
	a.TextSize = 14
	a.TextColor3 = TXT
	a.TextXAlignment = Enum.TextXAlignment.Left
	a.Text = label
	a.ZIndex = 13
	a.Parent = r
	local b = a:Clone()
	b.Position = UDim2.new(0, 12, 0, 27)
	b.Size = UDim2.new(1, -24, 0, 16)
	b.Font = Enum.Font.Gotham
	b.TextSize = 12
	b.TextColor3 = DIM
	b.Text = sub
	b.Parent = r
	if onClick then
		r.Activated:Connect(onClick)
	end
	r.Parent = body
	return r
end

----------------------------------------------------------------------
-- Logica
----------------------------------------------------------------------
local slots, lastSlot = nil, nil
local active = true

local function formatMoney(n)
	local s = tostring(math.floor(n or 0))
	local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
	if out:sub(1, 1) == "," then
		out = out:sub(2)
	end
	return "$" .. out
end

local function play(slot, mode)
	overlay.Visible = false
	SlotsRemote:FireServer("play", slot, mode)
end

local function slotPicker(load, free)
	pTitle.Text = if load then "Load Game" elseif free then "Free Roam — choose a slot" else "New Game — choose a slot"
	pSub.Text = if load then "Pick a save" else "Existing saves in a slot are overwritten when you save"
	clearBody()
	for _, s in ipairs(slots or {}) do
		if not load or s.used then
			local sub = if s.used then ("%s · %s · %d min"):format(s.chapter, formatMoney(s.money), math.floor((s.playTime or 0) / 60)) else "Empty"
			row("Slot " .. s.slot, sub, function()
				play(s.slot, if load then "load" elseif free then "free" else "new")
			end, s.slot)
		end
	end
	overlay.Visible = true
end

local FOVS = { 70, 80, 90 }
local function settings()
	pTitle.Text = "Settings"
	pSub.Text = "Graphics quality is set automatically by Roblox for your device"
	clearBody()
	local cur = player:GetAttribute("FOV") or 70
	for i, f in ipairs(FOVS) do
		row(("Field of view: %d°%s"):format(f, if f == cur then "  ★" else ""), if f == 70 then "Default" else "Wider view", function()
			player:SetAttribute("FOV", f)
			settings()
		end, i)
	end
	overlay.Visible = true
end

local function buildMenu()
	for _, c in ipairs(menu:GetChildren()) do
		if c:IsA("TextButton") then
			c:Destroy()
		end
	end
	local anyUsed = false
	for _, s in ipairs(slots or {}) do
		if s.used then
			anyUsed = true
		end
	end
	local last = if lastSlot and slots and slots[lastSlot] and slots[lastSlot].used then lastSlot else nil
	local n = 0
	local function add(label, primary, fn)
		n += 1
		button(menu, label, primary, fn).LayoutOrder = n
	end
	if last then
		add("Continue — Slot " .. last, true, function()
			play(last, "load")
		end)
	end
	add("New Game (Story)", not last, function()
		slotPicker(false, false)
	end)
	add("Free Roam (sandbox, no missions)", false, function()
		slotPicker(false, true)
	end)
	if anyUsed then
		add("Load Game", false, function()
			slotPicker(true, false)
		end)
	end
	add("Settings", false, settings)
end

-- Camara del menu: orbita sobre Downtown como updateTitle() del original
local CENTER = Vector3.new(260 * SC, 0, -140 * SC)
local titleT = 0
local camConn = RunService.RenderStepped:Connect(function(dt)
	if not active then
		return
	end
	titleT += dt
	local cam = workspace.CurrentCamera
	cam.CameraType = Enum.CameraType.Scriptable
	local a = titleT * 0.035 + 0.35
	local R = 430 * SC
	local pos = CENTER + Vector3.new(math.cos(a) * R, (150 + math.sin(titleT * 0.13) * 20) * SC, math.sin(a) * R)
	cam.CFrame = CFrame.lookAt(pos, CENTER + Vector3.new(0, 35 * SC, 0))
	cam.FieldOfView = 52
	if controls then
		controls:Disable()
	end
end)

local function startGame()
	active = false
	camConn:Disconnect()
	local cam = workspace.CurrentCamera
	cam.CameraType = Enum.CameraType.Custom
	local hum = player.Character and player.Character:FindFirstChildOfClass("Humanoid")
	if hum then
		cam.CameraSubject = hum
	end
	cam.FieldOfView = player:GetAttribute("FOV") or 70
	if controls then
		controls:Enable()
	end
	TweenService:Create(root, TweenInfo.new(0.5), { BackgroundTransparency = 1 }):Play()
	for _, d in ipairs(root:GetDescendants()) do
		if d:IsA("TextLabel") or d:IsA("TextButton") then
			TweenService:Create(d, TweenInfo.new(0.4), { TextTransparency = 1, BackgroundTransparency = 1 }):Play()
		end
	end
	task.delay(0.55, function()
		gui.Enabled = false
	end)
	player:SetAttribute("InGame", true)
end

player:GetAttributeChangedSignal("FOV"):Connect(function()
	if not active then
		workspace.CurrentCamera.FieldOfView = player:GetAttribute("FOV") or 70
	end
end)

SlotsRemote.OnClientEvent:Connect(function(kind, a, b)
	if kind == "list" then
		slots, lastSlot = a, b
		if active then
			buildMenu()
		end
	elseif kind == "started" then
		startGame()
	end
end)
SlotsRemote:FireServer("list")

-- Character: todos los jugadores aparecen como el protagonista de Port Solano
-- (Kit Calder en el juego original): piel bronceada, camiseta azul petroleo de manga
-- corta, pantalon negro, tenis blancos y pelo negro corto. Sin cara, como en el original.
-- StarterPlayer.LoadCharacterAppearance = false (en el archivo del lugar), asi el cuerpo
-- es el de bloques por defecto y no se cargan accesorios ni ropa del avatar.

local Players = game:GetService("Players")

local SKIN = Color3.fromRGB(0xd9, 0xa5, 0x77)
local SHIRT = Color3.fromRGB(0x1f, 0x6f, 0x8b)
local PANTS = Color3.fromRGB(0x23, 0x26, 0x2d)
local HAIR = Color3.fromRGB(0x1a, 0x14, 0x10)
local SHOES = Color3.fromRGB(0xe8, 0xe8, 0xe8)

-- R15 y R6
local COLORS = {
	Head = SKIN,
	UpperTorso = SHIRT, LowerTorso = PANTS, Torso = SHIRT,
	LeftUpperArm = SHIRT, RightUpperArm = SHIRT,
	LeftLowerArm = SKIN, RightLowerArm = SKIN, LeftHand = SKIN, RightHand = SKIN,
	["Left Arm"] = SHIRT, ["Right Arm"] = SHIRT,
	LeftUpperLeg = PANTS, RightUpperLeg = PANTS, LeftLowerLeg = PANTS, RightLowerLeg = PANTS,
	["Left Leg"] = PANTS, ["Right Leg"] = PANTS,
	LeftFoot = SHOES, RightFoot = SHOES,
}

local function dress(char)
	local head = char:WaitForChild("Head", 10)
	if not head then
		return
	end
	char:WaitForChild("Humanoid", 10)
	task.wait() -- deja que termine de montarse el personaje

	for _, inst in ipairs(char:GetChildren()) do
		if inst:IsA("BodyColors") or inst:IsA("Shirt") or inst:IsA("Pants") or inst:IsA("ShirtGraphic") or inst:IsA("Accessory") then
			inst:Destroy()
		end
	end
	for _, part in ipairs(char:GetChildren()) do
		if part:IsA("BasePart") and COLORS[part.Name] then
			part.Color = COLORS[part.Name]
			part.Material = Enum.Material.SmoothPlastic
		end
	end
	-- misma escala que la ciudad: 1,8 m de alto (1 m = 2 studs)
	if not char:GetAttribute("Scaled") then
		char:SetAttribute("Scaled", true)
		pcall(function()
			char:ScaleTo(0.75)
		end)
	end
	-- sin cara, como el modelo original
	local face = head:FindFirstChildOfClass("Decal")
	if face then
		face:Destroy()
	end
	-- pelo: bloque negro encima de la cabeza
	if char:FindFirstChild("Pelo") then
		return
	end
	local hair = Instance.new("Part")
	hair.Name = "Pelo"
	hair.Size = Vector3.new(head.Size.X * 1.08, head.Size.Y * 0.4, head.Size.Z * 1.08)
	hair.Color = HAIR
	hair.Material = Enum.Material.SmoothPlastic
	hair.CanCollide = false
	hair.CanQuery = false
	hair.CanTouch = false
	hair.Massless = true
	hair.CFrame = head.CFrame * CFrame.new(0, head.Size.Y * 0.38, 0.03)
	local weld = Instance.new("WeldConstraint")
	weld.Part0 = head
	weld.Part1 = hair
	weld.Parent = hair
	hair.Parent = char
end

local function onPlayer(plr)
	plr.CharacterAppearanceLoaded:Connect(dress)
	plr.CharacterAdded:Connect(function(char)
		task.defer(dress, char)
	end)
	if plr.Character then
		task.defer(dress, plr.Character)
	end
end

Players.PlayerAdded:Connect(onPlayer)
for _, plr in ipairs(Players:GetPlayers()) do
	onPlayer(plr)
end

-- VehicleModel: construye los vehiculos del juego original (src/vehicles/VehicleDefs.ts)
-- con piezas de Roblox, siguiendo la misma forma que carShape() de VehicleMesh.ts:
-- carroceria baja, capo inclinado, cabina con parabrisas, ruedas segun batalla/via,
-- faros, pilotos y extras (sirenas de policia, letrero de taxi, franja de autobus).
-- Coordenadas: el frente del vehiculo mira a -Z. Escala: 1 metro = Layout.SCALE studs.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Layout = require(ReplicatedStorage:WaitForChild("Layout"))
local Data = require(ReplicatedStorage:WaitForChild("VehicleDefs"))

local SC = Layout.SCALE
local M = Enum.Material
local VehicleModel = {}

VehicleModel.DEFS = {}
for _, d in ipairs(Data.DEFS) do
	VehicleModel.DEFS[d.id] = d
end

local mixTotal = 0
for _, e in ipairs(Data.TRAFFIC_MIX) do
	mixTotal += e[2]
end
function VehicleModel.randomTrafficId(rng)
	local r = (rng and rng:NextNumber() or math.random()) * mixTotal
	for _, e in ipairs(Data.TRAFFIC_MIX) do
		r -= e[2]
		if r <= 0 then
			return e[1]
		end
	end
	return "tern_200"
end

function VehicleModel.randomColor(def, rng)
	local c = def.colors[(rng and rng:NextInteger(1, #def.colors)) or math.random(1, #def.colors)]
	return Color3.fromRGB(c[1], c[2], c[3])
end

local BOXY = { bus = true, van = true, truck = true, ambulance = true, swat = true }

-- Crea una pieza. ref: CFrame del vehiculo a nivel del suelo; o = offset en METROS
local function mk(model, ref, size, offset, color, mat, opts)
	local p = Instance.new(opts and opts.wedge and "WedgePart" or "Part")
	p.Anchored = true
	p.Size = Vector3.new(math.max(0.05, size.X * SC), math.max(0.05, size.Y * SC), math.max(0.05, size.Z * SC))
	p.CFrame = ref * CFrame.new(offset.X * SC, offset.Y * SC, offset.Z * SC) * (opts and opts.rot or CFrame.identity)
	p.Color = color
	p.Material = mat or M.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.CanTouch = false
	if opts and opts.shape then
		p.Shape = opts.shape
	end
	if opts and opts.noCollide then
		p.CanCollide = false
		p.CanQuery = false
	end
	if opts and opts.reflect then
		p.Reflectance = opts.reflect
	end
	if opts and opts.name then
		p.Name = opts.name
	end
	p.Parent = model
	return p
end

local GLASS = Color3.fromRGB(12, 18, 24)
local TRIM = Color3.fromRGB(21, 23, 26)
local TIRE = Color3.fromRGB(20, 20, 20)
local RIM = Color3.fromRGB(184, 188, 194)
local HEAD = Color3.fromRGB(255, 242, 200)
local TAIL = Color3.fromRGB(154, 21, 21)
local R180 = CFrame.Angles(0, math.pi, 0)
local CYL = CFrame.Angles(0, 0, 0) -- el cilindro de Roblox ya tiene su eje en X (eje de las ruedas)

local function buildBike(model, ref, d, color)
	local wr = d.wheelR
	for _, z in ipairs({ -d.wheelbase / 2, d.wheelbase / 2 }) do
		mk(model, ref, Vector3.new(0.14, wr * 2, wr * 2), Vector3.new(0, wr, z), TIRE, M.SmoothPlastic, { shape = Enum.PartType.Cylinder, rot = CYL, noCollide = true })
	end
	mk(model, ref, Vector3.new(0.3, 0.35, d.len * 0.6), Vector3.new(0, wr + 0.35, 0), color, M.SmoothPlastic, { reflect = 0.1 })
	mk(model, ref, Vector3.new(0.34, 0.12, 0.6), Vector3.new(0, wr + 0.58, 0.25), TRIM)
	mk(model, ref, Vector3.new(0.7, 0.05, 0.05), Vector3.new(0, wr + 0.75, -d.wheelbase / 2 + 0.15), TRIM)
	mk(model, ref, Vector3.new(0.18, 0.1, 0.05), Vector3.new(0, wr + 0.5, -d.len / 2 + 0.05), HEAD, M.Neon, { noCollide = true })
end

-- Construye el modelo visual. groundCF: CFrame a nivel del suelo, frente hacia -Z.
-- Devuelve el Model (todas las piezas ancladas; quien lo use decide si las suelda).
function VehicleModel.build(id, color, groundCF)
	local d = VehicleModel.DEFS[id] or VehicleModel.DEFS.tern_200
	local model = Instance.new("Model")
	model.Name = d.maker .. " " .. d.name
	model:SetAttribute("VehicleId", d.id)
	color = color or VehicleModel.randomColor(d)
	local ref = groundCF

	if d.cls == "bike" then
		buildBike(model, ref, d, color)
		return model, d
	end

	local h, w = d.len / 2, d.wid / 2
	local y0 = 0.22
	local belt, roof, nose = d.beltY * d.hei, d.roofY * d.hei, d.noseY * d.hei
	-- en el original el frente es +Z; aqui es -Z, asi que cf/cr se invierten de signo
	local cf, cr = -d.cabin[1] * h, -d.cabin[2] * h -- z (Roblox) del frente y la parte trasera de la cabina
	cf, cr = -d.cabin[1] * h, -d.cabin[2] * h
	local zFront, zRear = math.min(cf, cr), math.max(cf, cr)
	local boxy = BOXY[d.cls] == true
	local paint = { reflect = 0.06 }

	-- carroceria baja (todo el largo, hasta la altura del morro)
	mk(model, ref, Vector3.new(d.wid, nose - y0, d.len * 0.97), Vector3.new(0, (y0 + nose) / 2, 0), color, M.SmoothPlastic, paint)
	if boxy then
		mk(model, ref, Vector3.new(d.wid, belt - nose, d.len * 0.97), Vector3.new(0, (nose + belt) / 2, 0), color, M.SmoothPlastic, paint)
	else
		-- capo inclinado (de la nariz a la cabina) + zaga a la altura de la cintura
		local hoodLen = math.max(0.2, zFront - (-h * 0.94))
		mk(model, ref, Vector3.new(d.wid * 0.96, belt - nose, hoodLen), Vector3.new(0, (nose + belt) / 2, -h * 0.94 + hoodLen / 2), color, M.SmoothPlastic, { wedge = true, reflect = 0.06 })
		local rearLen = h * 0.97 - zFront
		mk(model, ref, Vector3.new(d.wid, belt - nose, rearLen), Vector3.new(0, (nose + belt) / 2, zFront + rearLen / 2), color, M.SmoothPlastic, paint)
	end

	-- cabina
	local span = zRear - zFront
	if boxy then
		mk(model, ref, Vector3.new(d.wid * 0.97, roof - belt, span), Vector3.new(0, (belt + roof) / 2, (zFront + zRear) / 2), color, M.SmoothPlastic, paint)
		mk(model, ref, Vector3.new(d.wid * 0.9, (roof - belt) * 0.5, 0.06), Vector3.new(0, belt + (roof - belt) * 0.55, zFront - 0.02), GLASS, M.Glass, { reflect = 0.3, noCollide = true })
		for _, sx in ipairs({ -1, 1 }) do
			mk(model, ref, Vector3.new(0.05, (roof - belt) * 0.45, math.min(1.2, span * 0.3)), Vector3.new(sx * (w * 0.97 + 0.01), belt + (roof - belt) * 0.55, zFront + 0.7), GLASS, M.Glass, { reflect = 0.3, noCollide = true })
		end
	else
		local ws = span * 0.28
		local rs = span * 0.3
		local midLen = math.max(0.2, span - ws - rs)
		local cw = d.wid * 0.92
		local ch = roof - belt
		mk(model, ref, Vector3.new(cw * 0.95, ch, ws), Vector3.new(0, belt + ch / 2, zFront + ws / 2), GLASS, M.Glass, { wedge = true, reflect = 0.3 })
		mk(model, ref, Vector3.new(cw * 0.95, ch, midLen), Vector3.new(0, belt + ch / 2, zFront + ws + midLen / 2), GLASS, M.Glass, { reflect = 0.3 })
		mk(model, ref, Vector3.new(cw * 0.95, ch, rs), Vector3.new(0, belt + ch / 2, zRear - rs / 2), GLASS, M.Glass, { wedge = true, rot = R180, reflect = 0.3 })
		mk(model, ref, Vector3.new(cw * 0.8, 0.05, midLen), Vector3.new(0, roof + 0.02, zFront + ws + midLen / 2), color, M.SmoothPlastic, paint)
	end

	-- parachoques
	mk(model, ref, Vector3.new(d.wid * 1.02, 0.14, 0.08), Vector3.new(0, nose * 0.55, -h * 0.995), TRIM)
	mk(model, ref, Vector3.new(d.wid * 1.02, 0.14, 0.08), Vector3.new(0, nose * 0.55, h * 0.995), TRIM)
	-- faros y pilotos
	for _, sx in ipairs({ -1, 1 }) do
		mk(model, ref, Vector3.new(0.34, 0.12, 0.05), Vector3.new(sx * w * 0.72, nose * 0.78, -h * 0.99), HEAD, M.Neon, { noCollide = true, name = "Faro" })
		mk(model, ref, Vector3.new(0.34, 0.12, 0.05), Vector3.new(sx * w * 0.72, belt * 0.85, h * 0.99), TAIL, M.Neon, { noCollide = true, name = "Piloto" })
	end

	-- ruedas (como en el original: ejes en +-batalla/2, camiones y buses con tercer eje)
	local axles = { d.wheelbase / 2, -d.wheelbase / 2 }
	if d.cls == "truck" or d.cls == "bus" then
		table.insert(axles, d.wheelbase / 2 + 1.1)
	end
	for _, z in ipairs(axles) do
		for _, sx in ipairs({ -1, 1 }) do
			local x = sx * d.track / 2
			mk(model, ref, Vector3.new(0.24, d.wheelR * 2, d.wheelR * 2), Vector3.new(x, d.wheelR, z), TIRE, M.SmoothPlastic, { shape = Enum.PartType.Cylinder, noCollide = true })
			mk(model, ref, Vector3.new(0.26, d.wheelR * 1.1, d.wheelR * 1.1), Vector3.new(x, d.wheelR, z), RIM, M.Metal, { shape = Enum.PartType.Cylinder, noCollide = true })
		end
	end

	-- extras por clase
	local zc = (zFront + zRear) / 2
	if d.cls == "police" or d.cls == "swat" then
		mk(model, ref, Vector3.new(d.wid * 0.65, 0.1, 0.34), Vector3.new(0, roof + 0.07, zc), TRIM)
		mk(model, ref, Vector3.new(d.wid * 0.31, 0.12, 0.3), Vector3.new(-d.wid * 0.17, roof + 0.15, zc), Color3.fromRGB(255, 42, 42), M.Neon, { noCollide = true, name = "SirenaRoja" })
		mk(model, ref, Vector3.new(d.wid * 0.31, 0.12, 0.3), Vector3.new(d.wid * 0.17, roof + 0.15, zc), Color3.fromRGB(42, 90, 255), M.Neon, { noCollide = true, name = "SirenaAzul" })
		if d.cls == "police" then
			local stripe = if d.id == "pd_cruiser" then Color3.fromRGB(16, 17, 19) else Color3.fromRGB(242, 242, 242)
			mk(model, ref, Vector3.new(d.wid * 1.01, 0.5, span * 0.7 + 1.2), Vector3.new(0, belt * 0.55, -0.1), stripe, M.SmoothPlastic, { noCollide = true })
		end
	elseif d.cls == "taxi" then
		mk(model, ref, Vector3.new(0.7, 0.18, 0.24), Vector3.new(0, roof + 0.12, zc), Color3.fromRGB(255, 210, 63), M.Neon, { noCollide = true })
	elseif d.cls == "bus" then
		mk(model, ref, Vector3.new(d.wid * 0.85, 0.3, 0.05), Vector3.new(0, roof - 0.4, -h * 0.995), Color3.fromRGB(255, 210, 63), M.Neon, { noCollide = true })
	elseif d.cls == "ambulance" then
		mk(model, ref, Vector3.new(d.wid * 1.01, 0.35, span * 0.9), Vector3.new(0, belt + 0.4, zc), Color3.fromRGB(200, 40, 40), M.SmoothPlastic, { noCollide = true })
	end
	return model, d
end

return VehicleModel

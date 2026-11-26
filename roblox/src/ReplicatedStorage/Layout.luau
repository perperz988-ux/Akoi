--!strict
-- Layout: datos compartidos del mapa de Port Solano (servidor y cliente).
-- El mapa mide ~1000 x 900 studs. Tierra firme: X -480..300, Z -400..480.
-- Al este (X > 300) esta la playa Sunreef y el mar; al norte (Z < -400) el puerto.

local Layout = {}

Layout.LAND_MIN_X = -480
Layout.LAND_MAX_X = 300
Layout.LAND_MIN_Z = -400
Layout.LAND_MAX_Z = 480
Layout.WATER_Y = -2
Layout.ROAD_WIDTH = 24

-- Calles: lineas verticales (a lo largo de Z) en estas X, horizontales en estas Z.
Layout.ROADS_X = { -420, -280, -140, 0, 140, 280 }
Layout.ROADS_Z = { -360, -220, -80, 60, 200, 340 }

-- Isla Coral Key y su puente
Layout.ISLAND = { minX = 520, maxX = 720, minZ = -180, maxZ = 60 }
Layout.BRIDGE_Z = -60

export type District = {
	name: string,
	color: Color3,
}

local DISTRICTS: { [string]: District } = {
	Downtown = { name = "Downtown", color = Color3.fromRGB(120, 190, 255) },
	Port = { name = "Puerto Saltworks", color = Color3.fromRGB(255, 170, 80) },
	Galleria = { name = "Galleria", color = Color3.fromRGB(255, 120, 200) },
	Park = { name = "Parque Mirador", color = Color3.fromRGB(110, 220, 120) },
	Suburbs = { name = "Palm Hollow", color = Color3.fromRGB(200, 230, 140) },
	Ironside = { name = "Ironside", color = Color3.fromRGB(200, 140, 110) },
	OceanMile = { name = "Ocean Mile", color = Color3.fromRGB(90, 230, 220) },
	Beach = { name = "Playa Sunreef", color = Color3.fromRGB(255, 225, 140) },
	Island = { name = "Coral Key", color = Color3.fromRGB(255, 210, 90) },
	Sea = { name = "Mar de Solano", color = Color3.fromRGB(70, 150, 255) },
}
Layout.DISTRICTS = DISTRICTS

-- Devuelve la clave del distrito en una posicion (X, Z).
function Layout.districtKeyAt(x: number, z: number): string
	local isl = Layout.ISLAND
	if x >= isl.minX - 20 and x <= isl.maxX + 20 and z >= isl.minZ - 20 and z <= isl.maxZ + 20 then
		return "Island"
	end
	if x > Layout.LAND_MAX_X then
		if x < 400 and z >= Layout.LAND_MIN_Z and z <= Layout.LAND_MAX_Z then
			return "Beach"
		end
		return "Sea"
	end
	if x < Layout.LAND_MIN_X or z > Layout.LAND_MAX_Z then
		return "Sea"
	end
	if z < Layout.LAND_MIN_Z then
		return if x < -140 then "Port" else "Sea"
	end
	if x > 210 then
		return "OceanMile"
	end
	if z < -220 then
		return if x < -140 then "Port" else "Galleria"
	end
	if x < -140 then
		return if z < 60 then "Park" else "Suburbs"
	end
	if z < 200 then
		return "Downtown"
	end
	return "Ironside"
end

function Layout.districtAt(x: number, z: number): District
	return DISTRICTS[Layout.districtKeyAt(x, z)]
end

-- Destinos para los trabajos de reparto.
export type Destination = { name: string, pos: Vector3 }
Layout.DESTINATIONS = {
	{ name = "Muelle del Puerto", pos = Vector3.new(-350, 1, -385) },
	{ name = "Centro Comercial Galleria", pos = Vector3.new(0, 1, -300) },
	{ name = "Torre Solano (Downtown)", pos = Vector3.new(70, 1, 60) },
	{ name = "Parque Mirador", pos = Vector3.new(-280, 1, -80) },
	{ name = "Casa en Palm Hollow", pos = Vector3.new(-350, 1, 200) },
	{ name = "Esquina de Ironside", pos = Vector3.new(0, 1, 340) },
	{ name = "Hotel Ocean Mile", pos = Vector3.new(280, 1, 130) },
	{ name = "Chiringuito de Sunreef", pos = Vector3.new(330, 1, 300) },
	{ name = "Mansion de Coral Key", pos = Vector3.new(620, 1, -60) },
	{ name = "Cruce de la Ruta 9", pos = Vector3.new(-140, 1, 470) },
} :: { Destination }

-- Plaza de aparicion (Plaza Solano, en Downtown)
Layout.SPAWN = Vector3.new(-70, 0.5, -10)

-- Coches aparcados al iniciar el servidor: posicion y angulo (grados, 0 = mirando a -Z)
Layout.CAR_SPOTS = {
	{ pos = Vector3.new(-62, 0, 52), yaw = 90 },
	{ pos = Vector3.new(-40, 0, 52), yaw = 90 },
	{ pos = Vector3.new(8, 0, -40), yaw = 0 },
	{ pos = Vector3.new(272, 0, -150), yaw = 180 },
	{ pos = Vector3.new(272, 0, 100), yaw = 180 },
	{ pos = Vector3.new(-280 + 8, 0, -140), yaw = 0 },
	{ pos = Vector3.new(-350, 0, -372 + 4), yaw = 90 },
	{ pos = Vector3.new(-350, 0, 192), yaw = 90 },
	{ pos = Vector3.new(-8, 0, 300), yaw = 180 },
	{ pos = Vector3.new(60, 0, -290), yaw = 0 },
	{ pos = Vector3.new(80, 0, -290), yaw = 0 },
	{ pos = Vector3.new(640, 0, -52), yaw = 90 },
	{ pos = Vector3.new(148, 0, 400), yaw = 0 },
	{ pos = Vector3.new(-420 + 8, 0, 420), yaw = 0 },
}

-- 25 conchas doradas escondidas por el mapa
Layout.SHELLS = {
	Vector3.new(320, 2, -300), Vector3.new(318, 2, 420), Vector3.new(312, 2, 150),
	Vector3.new(620, 3, 20), Vector3.new(700, 3, -160), Vector3.new(410, 4, -60),
	Vector3.new(-300, 3, -420), Vector3.new(-460, 3, -380), Vector3.new(-210, 3, -150),
	Vector3.new(-350, 3, -10), Vector3.new(-460, 3, 460), Vector3.new(-280, 3, 410),
	Vector3.new(0, 3, 470), Vector3.new(140, 3, 260), Vector3.new(-90, 3, 20),
	Vector3.new(70, 3, -220), Vector3.new(280, 3, -390), Vector3.new(-420, 3, 60),
	Vector3.new(210, 3, 340), Vector3.new(550, 3, -170), Vector3.new(-140, 3, -390),
	Vector3.new(140, 3, -80), Vector3.new(325, 2, -200), Vector3.new(0, 3, 200),
	Vector3.new(-420, 3, 340),
}

-- Altura de la arena en la playa (losa inclinada 3 grados)
function Layout.beachY(x: number): number
	return -3.46 + (368 - x) * math.tan(math.rad(3))
end

return Layout

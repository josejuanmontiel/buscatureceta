let additivesCache = null;

export async function getAllAdditives() {
    if (additivesCache) return additivesCache;
    
    try {
        const res = await fetch('/data/additives.json');
        if (!res.ok) throw new Error('No se pudo cargar el diccionario de aditivos');
        additivesCache = await res.json();
        return additivesCache;
    } catch (e) {
        console.error('Error cargando additives.json', e);
        return [];
    }
}

export async function searchAdditives(query) {
    const all = await getAllAdditives();
    if (!query) return all;
    
    const q = query.toLowerCase().trim();
    return all.filter(a => 
        a.code.toLowerCase().includes(q) || 
        a.name.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q)
    );
}

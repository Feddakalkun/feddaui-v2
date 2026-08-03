// Free LoRA Pack Configuration
export interface LoRAInfo {
    id: string;
    name: string;
    filename: string;
    emoji: string;
    trigger: string;
    description: string;
    /** Appearance anchor — prepend to prompts so the character stays consistent. */
    appearance: string;
    size_mb: number;
    preview: string;       // card image (public path)
    download_url: string;  // direct download link
}

// Ids and filenames must match backend/lora_service.py FREE_LORAS: the UI looks
// status up by id, so "zana" here against "sana" there reported every install as
// missing. Downloads come from the public FeddaKalkun/free-loras dataset - the
// Google Drive share links this used to carry are viewer pages, not files, so
// they could never have installed anything.
export const FREE_LORAS: LoRAInfo[] = [
    {
        id: 'emmy',
        name: 'Emmy',
        filename: 'emmy.safetensors',
        emoji: '👱‍♀️',
        trigger: 'emmy',
        description: 'Scandinavian blonde — pale freckled skin, ash-blonde hair, blue-grey eyes.',
        appearance: 'emmy, a Scandinavian woman in her mid-twenties, ash-blonde hair, pale fair skin with light freckles across the nose and cheeks, thick dark eyebrows, pale blue-grey eyes, natural full lips, slim oval face',
        size_mb: 340,
        preview: '/loras/emmy.jpg',
        download_url: 'https://huggingface.co/datasets/FeddaKalkun/free-loras/resolve/main/Emmy/Emmy.safetensors',
    },
    {
        id: 'sana',
        name: 'Zana',
        filename: 'sana.safetensors',
        emoji: '👩🏽',
        trigger: 'sana',
        description: 'Warm tan skin, long wavy chestnut hair, hazel eyes.',
        appearance: 'sana, a woman in her early twenties, warm tan light-brown skin, long wavy chestnut-brown hair, hazel almond eyes, full lips, subtle freckles, soft oval face',
        size_mb: 170,
        preview: '/loras/zana.jpg',
        download_url: 'https://huggingface.co/datasets/FeddaKalkun/free-loras/resolve/main/Sana/sana.safetensors',
    },
];

export const TOTAL_LORA_SIZE_MB = FREE_LORAS.reduce((sum, lora) => sum + lora.size_mb, 0);

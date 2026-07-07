export function resolveTemplate(
    input: string,
    variables: Record<string, any>
): string {

    return input.replace(/\{\{(.*?)\}\}/g, (_, key) => {
        const value = variables[key.trim()];
        return value !== undefined ? String(value) : `{{${key}}}`;
    });
}

declare module 'vdf' {
    export function parse(text: string): object;
    export function stringify(obj: object): string;
}

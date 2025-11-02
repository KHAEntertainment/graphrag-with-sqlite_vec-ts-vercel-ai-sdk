export class HelloWorld {
  constructor(private name: string) {}

  greet(): string {
    return `Hello, ${this.name}!`;
  }
}

export function createGreeter(name: string): HelloWorld {
  return new HelloWorld(name);
}

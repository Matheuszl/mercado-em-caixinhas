# Mercado Em Caixinhas

Controlar o dinheiro reservado para o mercado. Todo mês começa com um saldo dividido em fontes: Matheus R$ 1.200,00 e Maria R$ 500,00 (total R$ 1.700,00). A cada ida ao mercado, a nota fiscal é lida pelo app, que desconta o total da fonte escolhida e guarda a lista do que foi comprado. Na virada do mês, as fontes voltam aos valores padrão e o mês anterior fica guardado como uma “caixinha” que pode ser reaberta.

Quem usa. Duas pessoas da casa, pelo celular, em um app publicado na internet (sempre disponível, sem rodar nada no computador).

Imagine uma tela com saldo inicial sempre começo de mês, conforme formos no mercado a cada compra pegamos a nota fiscal, digitalizamos no celular e com o código colocamos no app, que usa API publica de notas fiscais e conseguir puxar as compras e valor total da nota, nessa mesma ações, deve poder escolher de qual saldo desconta, e a nota fica guardada para poder ser lida depois se usuários quiserem. Então imagine que tela principal mostra o mes e compras atuais, quando mes vira isso se torna um historico do mes + compras, alem das informaçoes de sado positivo ou negativo caso tenha saido mais que o orçamento inicial. Essa deve ser a primeira feture.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://mercado-em-caixinhas.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4bf8d722-7844-4742-9f98-7276b719b988).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

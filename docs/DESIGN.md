# Design System - HMSJ (Hospital São José)

## 1. Filosofia de Interface e UX
- Objetivo: Redução drástica de carga cognitiva. A interface deve ser autoexplicativa.
- Densidade: Alta densidade de informação, porém utilizando espaçamentos consistentes (padding) para não gerar poluição visual.
- Tema: Light Mode. O fundo deve ser off-white (quase branco) para reduzir o cansaço visual, com tipografia escura de alto contraste.
- Acessibilidade: Botões com área de toque mínima de 44x44px (padrão mobile) para facilitar o uso com luvas cirúrgicas.

## 2. Paleta de Cores Institucionais
- Cor Primária (Base): Blue Navy (Inspirado na identidade da Prefeitura de Joinville). Usado em cabeçalhos e botões de ação primária.
- Cores de Alerta (Semântica de Internação):
  - Verde (Estável): Até 48h (Métrica de Destaque).
  - Amarelo (Atenção): 48h a 72h.
  - Laranja (Alerta): 72h a 7 dias.
  - Vermelho (Crítico): 7 a 15 dias.
  - Roxo (Crônico/Longo Prazo): 15 a 30 dias.
  - Cinza Escuro (Revisão Urgente): Mais de 30 dias.

## 3. Ativos Visuais (Assets)
- Logo: Logotipo vertical positivo da Prefeitura de Joinville.
- Caminho no projeto: `/frontend/public/logo-joinville.png`

## 4. Estrutura Detalhada do Dashboard (Layout)
- Header (Cabeçalho): Logo à esquerda, título do sistema ao centro, relógio/data atual à direita.
- Hero Section (Visão de 3 Segundos): Um card grande e destacado informando o número total de 'Pacientes < 48h'.
- Action Bar (Barra de Ações): 
  - Botão [Atualizar Lista] (Secundário)
  - Botão [Importar Relatório XLS] (Primário - Blue Navy)
  - Botão [Gerar PDF] (Secundário)
- Área de Filtros: Filtros colapsáveis (para economizar espaço em mobile) por Setor e por Tempo.
- Data Table (Lista de Pacientes): Tabela responsiva. Em mobile, transforma-se em 'Cards' empilhados. Em desktop, exibe a tabela completa agrupada por setor e colorida conforme a segmentação de tempo.

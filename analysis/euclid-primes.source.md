<!-- docent explainer source -->
<!-- fetched: 2026-05-23T15:28:08.318Z -->
<!-- url: https://en.wikipedia.org/wiki/Euclid%27s_theorem -->
# Euclid's theorem - Wikipedia

---

Jump to content

 
 
 
 

 
 
 
 
 

 

 
 

 

Search
 
 
 
 
 

 

 
 

 
 
 
 
 
 

 
 

 

 
 
 
 
- Donate

- Create account

- Log in

 
 

 
 

 

 

 
 

Personal tools
 
 

 

 
 
 
 
- 

Donate

- 

Create account

- 

Log in

 
 

 
 

 
 

 

 

 
 
 

 

 
 
 
 
 

 

 
 
 

 

 
 
 
 
 

# Euclid's theorem

 

 
 

32 languages
 
 

 
 
 
 
 
- العربية
- Català
- کوردی
- Čeština
- Deutsch
- Ελληνικά
- Español
- Euskara
- فارسی
- Français
- Galego
- עברית
- हिन्दी
- Հայերեն
- Bahasa Indonesia
- Italiano
- 日本語
- 한국어
- Lëtzebuergesch
- Lietuvių
- Македонски
- Монгол
- Nederlands
- Polski
- Português
- Русский
- Српски / srpski
- Svenska
- Türkçe
- Українська
- Tiếng Việt
- 中文
 

 Edit links

 

 

 
 
 
 
 

 
 
 
 
 

 

 

 
 
 

 
 
 

 

 
 
 
 

 From Wikipedia, the free encyclopedia

 

 

 
 
 

Infinitely many prime numbers exist

This article is about the theorem on the infinitude of prime numbers. For the theorem on perfect numbers and Mersenne primes, see Euclid–Euler theorem. For the theorem on the divisibility of products by primes, see Euclid's lemma.

Euclid's theorem is a fundamental statement in number theory that asserts that there are infinitely many prime numbers. It was first proven by Euclid in his work Elements. There are at least 200 proofs of the theorem.[1]

## Euclid's proof

[edit]

Euclid offered a proof in his work Elements (Book IX, Proposition 20),[2] which is paraphrased here.[3]

Consider any finite list of prime numbers p1, p2, ..., pn. It will be shown that there exists at least one additional prime number not included in this list. Let P be the product of all the prime numbers in the list: P = p1p2⋅⋅⋅pn. Let q = P + 1. Since q is either prime or not:

- If q is prime, then there is at least one more prime that is not in the list, namely, q itself.

- If q is not prime, then some prime factor p divides q. If this factor p were in our list, then it would also divide P (since P is the product of every number in the list). If p divides P and q, then p must also divide the difference[4] of the two numbers, which is (P + 1) − P or just 1. Since no prime number divides 1, p cannot be in the list. This means that at least one more prime number exists that is not in the list.

This proves that for every finite list of prime numbers there is a prime number not in the list.[5] In the original work, Euclid denoted the arbitrary finite set of prime numbers as A, B, Γ.[6]

Euclid is often erroneously reported to have proved this result by contradiction beginning with the assumption that the finite set initially considered contains all prime numbers,[7] though it is actually a proof by cases, a direct proof method. The philosopher Torkel Franzén, in a book on logic, states, "Euclid's proof that there are infinitely many primes is not an indirect proof [...] The argument is sometimes formulated as an indirect proof by replacing it with the assumption 'Suppose q1, ..., qn are all the primes'. However, since this assumption isn't even used in the proof, the reformulation is pointless."[8]

### Variations

[edit]

Several variations on Euclid's proof exist, including the following:

The factorial n! of a positive integer n is divisible by every integer from 2 to n, as it is the product of all of them. Hence, n! + 1 is not divisible by any of the integers from 2 to n, inclusive (it gives a remainder of 1 when divided by each). Hence n! + 1 is either prime or divisible by a prime larger than n. In either case, for every positive integer n, there is at least one prime bigger than n. The conclusion is that the number of primes is infinite.[9]

## Euler's proof

[edit]

Another proof, by the Swiss mathematician Leonhard Euler, relies on the fundamental theorem of arithmetic: that every integer has a unique prime factorization. What Euler wrote (not with this modern notation and, unlike modern standards, not restricting the arguments in sums and products to any finite sets of integers) is equivalent to the statement that[10]

 
 
 
 
 &#x220F;
 
 p
 &#x2208;
 
 P
 
 k
 
 
 
 
 
 
 1
 
 1
 &#x2212;
 
 
 1
 p
 
 
 
 
 
 =
 
 &#x2211;
 
 n
 &#x2208;
 
 N
 
 k
 
 
 
 
 
 
 1
 n
 
 
 ,
 
 
 {\displaystyle \prod _{p\in P_{k}}{\frac {1}{1-{\frac {1}{p}}}}=\sum _{n\in N_{k}}{\frac {1}{n}},}
 

where 
 
 
 
 
 P
 
 k
 
 
 
 
 {\displaystyle P_{k}}
 
 denotes the set of the k first prime numbers, and 
 
 
 
 
 N
 
 k
 
 
 
 
 {\displaystyle N_{k}}
 
 is the set of the positive integers whose prime factors are all in 
 
 
 
 
 P
 
 k
 
 
 .
 
 
 {\displaystyle P_{k}.}
 

To show this, one expands each factor in the product as a geometric series, and distributes the product over the sum (this is a special case of the Euler product formula for the Riemann zeta function). 

 
 
 
 
 
 
 
 
 &#x220F;
 
 p
 &#x2208;
 
 P
 
 k
 
 
 
 
 
 
 1
 
 1
 &#x2212;
 
 
 1
 p
 
 
 
 
 
 
 
 
 =
 
 &#x220F;
 
 p
 &#x2208;
 
 P
 
 k
 
 
 
 
 
 &#x2211;
 
 i
 &#x2265;
 0
 
 
 
 
 1
 
 p
 
 i
 
 
 
 
 
 
 
 
 
 
 =
 
 (
 
 
 &#x2211;
 
 i
 &#x2265;
 0
 
 
 
 
 1
 
 2
 
 i
 
 
 
 
 
 )
 
 &#x22C5;
 
 (
 
 
 &#x2211;
 
 i
 &#x2265;
 0
 
 
 
 
 1
 
 3
 
 i
 
 
 
 
 
 )
 
 &#x22C5;
 
 (
 
 
 &#x2211;
 
 i
 &#x2265;
 0
 
 
 
 
 1
 
 5
 
 i
 
 
 
 
 
 )
 
 &#x22C5;
 
 (
 
 
 &#x2211;
 
 i
 &#x2265;
 0
 
 
 
 
 1
 
 7
 
 i
 
 
 
 
 
 )
 
 &#x22EF;
 
 
 
 
 
 
 =
 
 &#x2211;
 
 &#x2113;
 ,
 m
 ,
 n
 ,
 p
 ,
 &#x2026;
 &#x2265;
 0
 
 
 
 
 1
 
 
 2
 
 &#x2113;
 
 
 
 3
 
 m
 
 
 
 5
 
 n
 
 
 
 7
 
 p
 
 
 &#x22EF;
 
 
 
 
 
 
 
 
 
 =
 
 &#x2211;
 
 n
 &#x2208;
 
 N
 
 k
 
 
 
 
 
 
 1
 n
 
 
 .
 
 
 
 
 
 
 {\displaystyle {\begin{aligned}\prod _{p\in P_{k}}{\frac {1}{1-{\frac {1}{p}}}}&=\prod _{p\in P_{k}}\sum _{i\geq 0}{\frac {1}{p^{i}}}\\&=\left(\sum _{i\geq 0}{\frac {1}{2^{i}}}\right)\cdot \left(\sum _{i\geq 0}{\frac {1}{3^{i}}}\right)\cdot \left(\sum _{i\geq 0}{\frac {1}{5^{i}}}\right)\cdot \left(\sum _{i\geq 0}{\frac {1}{7^{i}}}\right)\cdots \\&=\sum _{\ell ,m,n,p,\ldots \geq 0}{\frac {1}{2^{\ell }3^{m}5^{n}7^{p}\cdots }}\\&=\sum _{n\in N_{k}}{\frac {1}{n}}.\end{aligned}}}
 

In the penultimate sum, every product of primes appears exactly once, so the last equality is true by the fundamental theorem of arithmetic. In his first corollary to this result Euler denotes by a symbol similar to 
 
 
 
 &#x221E;
 
 
 {\displaystyle \infty }
 
 the "absolute infinity" and writes that the infinite sum in the statement equals the "value" ⁠
 
 
 
 log
 &#x2061;
 &#x221E;
 
 
 {\displaystyle \log \infty }
 
⁠, to which the infinite product is thus also equal (in modern terminology this is equivalent to saying that the partial sum up to 
 
 
 
 x
 
 
 {\displaystyle x}
 
 of the harmonic series diverges asymptotically like ⁠
 
 
 
 log
 &#x2061;
 x
 
 
 {\displaystyle \log x}
 
⁠). Then in his second corollary, Euler notes that the product 

 
 
 
 
 &#x220F;
 
 n
 &#x2265;
 2
 
 
 
 
 1
 
 1
 &#x2212;
 
 
 1
 
 n
 
 2
 
 
 
 
 
 
 
 
 
 {\displaystyle \prod _{n\geq 2}{\frac {1}{1-{\frac {1}{n^{2}}}}}}
 

converges to the finite value 2, and there are consequently more primes than squares. This proves Euclid's theorem.[11]

Symbol used by Euler to denote infinity
In the same paper (Theorem 19) Euler in fact used the above equality to prove a much stronger theorem that was unknown before him, namely that the series 

 
 
 
 
 &#x2211;
 
 p
 &#x2208;
 P
 
 
 
 
 1
 p
 
 
 
 
 {\displaystyle \sum _{p\in P}{\frac {1}{p}}}
 

is divergent, where P denotes the set of all prime numbers (Euler writes that the infinite sum equals ⁠
 
 
 
 log
 &#x2061;
 log
 &#x2061;
 &#x221E;
 
 
 {\displaystyle \log \log \infty }
 
⁠, which in modern terminology is equivalent to saying that the partial sum up to 
 
 
 
 x
 
 
 {\displaystyle x}
 
 of this series behaves asymptotically like ⁠
 
 
 
 log
 &#x2061;
 log
 &#x2061;
 x
 
 
 {\displaystyle \log \log x}
 
⁠).

## Erdős's proof

[edit]

Paul Erdős gave a proof[12] that also relies on the fundamental theorem of arithmetic. Every positive integer has a unique factorization into a square-free number r and a square number s2. For example, 75,600 = 24 33 52 71 = 21 ⋅ 602.

Let N be a positive integer, and let k be the number of primes less than or equal to N. Call those primes p1, ... , pk. Any positive integer a which is less than or equal to N can then be written in the form

 
 
 
 a
 =
 
 (
 
 
 p
 
 1
 
 
 
 e
 
 1
 
 
 
 
 
 p
 
 2
 
 
 
 e
 
 2
 
 
 
 
 &#x22EF;
 
 p
 
 k
 
 
 
 e
 
 k
 
 
 
 
 
 )
 
 
 s
 
 2
 
 
 ,
 
 
 {\displaystyle a=\left(p_{1}^{e_{1}}p_{2}^{e_{2}}\cdots p_{k}^{e_{k}}\right)s^{2},}
 

where each ei is either 0 or 1. There are 2k ways of forming the square-free part of a. And s2 can be at most N, so s ≤ √N. Thus, at most 2k √N numbers can be written in this form. In other words,

 
 
 
 N
 &#x2264;
 
 2
 
 k
 
 
 
 
 N
 
 
 .
 
 
 {\displaystyle N\leq 2^{k}{\sqrt {N}}.}
 

Or, rearranging, k, the number of primes less than or equal to N, is greater than or equal to ⁠1/2⁠log2 N. Since N was arbitrary, k can be as large as desired by choosing N appropriately.

## Furstenberg's proof

[edit]

- Main article: Furstenberg's proof of the infinitude of primes

In the 1950s, Hillel Furstenberg introduced a proof by contradiction using point-set topology.[13]

Define a topology on the integers ⁠
 
 
 
 
 Z
 
 
 
 {\displaystyle \mathbb {Z} }
 
⁠, called the evenly spaced integer topology, by declaring a subset ⁠
 
 
 
 U
 &#x2286;
 
 Z
 
 
 
 {\displaystyle U\subseteq \mathbb {Z} }
 
⁠ to be an open set if and only if it is either the empty set, ⁠
 
 
 
 &#x2205;
 
 
 {\displaystyle \emptyset }
 
⁠, or it is a union of arithmetic sequences 
 
 
 
 S
 (
 a
 ,
 b
 )
 
 
 {\textstyle S(a,b)}
 
 (for ⁠
 
 
 
 a
 &#x2260;
 0
 
 
 {\displaystyle a\neq 0}
 
⁠), where

 
 
 
 S
 (
 a
 ,
 b
 )
 =
 {
 a
 n
 +
 b
 &#x2223;
 n
 &#x2208;
 
 Z
 
 }
 =
 a
 
 Z
 
 +
 b
 .
 
 
 {\displaystyle S(a,b)=\{an+b\mid n\in \mathbb {Z} \}=a\mathbb {Z} +b.}
 

Then a contradiction follows from the property that a finite set of integers cannot be open and the property that the basis sets 
 
 
 
 S
 (
 a
 ,
 b
 )
 
 
 {\textstyle S(a,b)}
 
 are both open and closed, since

 
 
 
 
 Z
 
 &#x2216;
 {
 &#x2212;
 1
 ,
 +
 1
 }
 =
 
 &#x22C3;
 
 p
 
 &#xA0;prime
 
 
 
 S
 (
 p
 ,
 0
 )
 
 
 {\displaystyle \mathbb {Z} \setminus \{-1,+1\}=\bigcup _{p{\text{ prime}}}S(p,0)}
 

cannot be closed because its complement is finite, but is closed since it is a finite union of closed sets.

## Recent proofs

[edit]

### Proof using the inclusion–exclusion principle

[edit]

Juan Pablo Pinasco has written the following proof.[14]

Let p1, ..., pN be the smallest N primes. Then by the inclusion–exclusion principle, the number of positive integers less than or equal to x that are divisible by one of those primes is

 
 
 
 
 
 
 
 1
 +
 
 &#x2211;
 
 i
 
 
 
 &#x230A;
 
 
 x
 
 p
 
 i
 
 
 
 
 &#x230B;
 
 &#x2212;
 
 &#x2211;
 
 i
 <
 j
 
 
 
 &#x230A;
 
 
 x
 
 
 p
 
 i
 
 
 
 p
 
 j
 
 
 
 
 
 &#x230B;
 
 
 
 
 +
 
 &#x2211;
 
 i
 <
 j
 <
 k
 
 
 
 &#x230A;
 
 
 x
 
 
 p
 
 i
 
 
 
 p
 
 j
 
 
 
 p
 
 k
 
 
 
 
 
 &#x230B;
 
 &#x2212;
 &#x22EF;
 
 
 
 
 
 
 &#x22EF;
 &#x00B1;
 (
 &#x2212;
 1
 
 )
 
 N
 +
 1
 
 
 
 &#x230A;
 
 
 x
 
 
 p
 
 1
 
 
 &#x22EF;
 
 p
 
 N
 
 
 
 
 
 &#x230B;
 
 .
 
 (
 1
 )
 
 
 
 
 
 
 {\displaystyle {\begin{aligned}1+\sum _{i}\left\lfloor {\frac {x}{p_{i}}}\right\rfloor -\sum _{i<j}\left\lfloor {\frac {x}{p_{i}p_{j}}}\right\rfloor &+\sum _{i<j<k}\left\lfloor {\frac {x}{p_{i}p_{j}p_{k}}}\right\rfloor -\cdots \\&\cdots \pm (-1)^{N+1}\left\lfloor {\frac {x}{p_{1}\cdots p_{N}}}\right\rfloor .\qquad (1)\end{aligned}}}
 

Dividing by x and letting x → ∞ gives

 
 
 
 
 &#x2211;
 
 i
 
 
 
 
 1
 
 p
 
 i
 
 
 
 
 &#x2212;
 
 &#x2211;
 
 i
 <
 j
 
 
 
 
 1
 
 
 p
 
 i
 
 
 
 p
 
 j
 
 
 
 
 
 +
 
 &#x2211;
 
 i
 <
 j
 <
 k
 
 
 
 
 1
 
 
 p
 
 i
 
 
 
 p
 
 j
 
 
 
 p
 
 k
 
 
 
 
 
 &#x2212;
 &#x22EF;
 &#x00B1;
 (
 &#x2212;
 1
 
 )
 
 N
 +
 1
 
 
 
 
 1
 
 
 p
 
 1
 
 
 &#x22EF;
 
 p
 
 N
 
 
 
 
 
 .
 
 (
 2
 )
 
 
 {\displaystyle \sum _{i}{\frac {1}{p_{i}}}-\sum _{i<j}{\frac {1}{p_{i}p_{j}}}+\sum _{i<j<k}{\frac {1}{p_{i}p_{j}p_{k}}}-\cdots \pm (-1)^{N+1}{\frac {1}{p_{1}\cdots p_{N}}}.\qquad (2)}
 

This can be written as

 
 
 
 1
 &#x2212;
 
 &#x220F;
 
 i
 =
 1
 
 
 N
 
 
 
 (
 
 1
 &#x2212;
 
 
 1
 
 p
 
 i
 
 
 
 
 
 )
 
 .
 
 (
 3
 )
 
 
 {\displaystyle 1-\prod _{i=1}^{N}\left(1-{\frac {1}{p_{i}}}\right).\qquad (3)}
 

If no other primes than p1, ..., pN exist, then the expression in (1) is equal to 
 
 
 
 &#x230A;
 x
 &#x230B;
 
 
 {\displaystyle \lfloor x\rfloor }
 
 and the expression in (2) is equal to 1, but clearly the expression in (3) is not equal to 1. Therefore, there must be more primes than  p1, ..., pN.

### Proof using Legendre's formula

[edit]

In 2010, Junho Peter Whang published the following proof by contradiction.[15] Let k be any positive integer. Then according to Legendre's formula (sometimes attributed to de Polignac)

 
 
 
 k
 !
 =
 
 &#x220F;
 
 p
 
 &#xA0;prime
 
 
 
 
 p
 
 f
 (
 p
 ,
 k
 )
 
 
 
 
 {\displaystyle k!=\prod _{p{\text{ prime}}}p^{f(p,k)}}
 

where

 
 
 
 f
 (
 p
 ,
 k
 )
 =
 
 &#x230A;
 
 
 k
 p
 
 
 &#x230B;
 
 +
 
 &#x230A;
 
 
 k
 
 p
 
 2
 
 
 
 
 &#x230B;
 
 +
 &#x22EF;
 .
 
 
 {\displaystyle f(p,k)=\left\lfloor {\frac {k}{p}}\right\rfloor +\left\lfloor {\frac {k}{p^{2}}}\right\rfloor +\cdots .}
 

 
 
 
 f
 (
 p
 ,
 k
 )
 <
 
 
 k
 p
 
 
 +
 
 
 k
 
 p
 
 2
 
 
 
 
 +
 &#x22EF;
 =
 
 
 k
 
 p
 &#x2212;
 1
 
 
 
 &#x2264;
 k
 .
 
 
 {\displaystyle f(p,k)<{\frac {k}{p}}+{\frac {k}{p^{2}}}+\cdots ={\frac {k}{p-1}}\leq k.}
 

But if only finitely many primes exist, then

 
 
 
 
 lim
 
 k
 &#x2192;
 &#x221E;
 
 
 
 
 
 
 (
 
 
 &#x220F;
 
 p
 
 
 p
 
 )
 
 
 k
 
 
 
 k
 !
 
 
 
 =
 0
 ,
 
 
 {\displaystyle \lim _{k\to \infty }{\frac {\left(\prod _{p}p\right)^{k}}{k!}}=0,}
 

(the numerator of the fraction would grow singly exponentially while by Stirling's approximation the denominator grows more quickly than singly exponentially),
contradicting the fact that for each k the numerator is greater than or equal to the denominator.

### Proof by construction

[edit]

Filip Saidak gave the following proof by construction, which does not use reductio ad absurdum[16] or Euclid's lemma (that if a prime p divides ab then it must divide a or b).

Since each natural number greater than 1 has at least one prime factor, and two successive numbers n and (n + 1) have no prime factor in common, the product n(n + 1) has more different prime factors than the number n itself. So the chain of pronic numbers 
1 × 2 = 2 {2},    2 × 3 = 6 {2, 3},    6 × 7 = 42 {2, 3, 7},    42 × 43 = 1806 {2, 3, 7, 43},    1806 × 1807 = 3263442 {2, 3, 7, 43, 13, 139}, ...
provides a sequence of unlimited growing sets of primes.

### Proof using the incompressibility method

[edit]

- Further information: Incompressibility method

Suppose there were only k primes (p1, ..., pk). By the fundamental theorem of arithmetic, any positive integer n could then be represented as

 
 
 
 n
 =
 
 
 
 p
 
 1
 
 
 
 
 
 e
 
 1
 
 
 
 
 
 
 
 p
 
 2
 
 
 
 
 
 e
 
 2
 
 
 
 
 &#x22EF;
 
 
 
 p
 
 k
 
 
 
 
 
 e
 
 k
 
 
 
 
 ,
 
 
 {\displaystyle n={p_{1}}^{e_{1}}{p_{2}}^{e_{2}}\cdots {p_{k}}^{e_{k}},}
 

where the non-negative integer exponents ei together with the finite-sized list of primes are enough to reconstruct the number. Since 
 
 
 
 
 p
 
 i
 
 
 &#x2265;
 2
 
 
 {\displaystyle p_{i}\geq 2}
 
 for all i, it follows that 
 
 
 
 
 e
 
 i
 
 
 &#x2264;
 lg
 &#x2061;
 n
 
 
 {\displaystyle e_{i}\leq \lg n}
 
 for all i (where 
 
 
 
 lg
 
 
 {\displaystyle \lg }
 
 denotes the base-2 logarithm). This yields an encoding for n of the following size (using big O notation):

 
 
 
 O
 (
 
 prime list size
 
 +
 k
 lg
 &#x2061;
 lg
 &#x2061;
 n
 )
 =
 O
 (
 lg
 &#x2061;
 lg
 &#x2061;
 n
 )
 
 
 {\displaystyle O({\text{prime list size}}+k\lg \lg n)=O(\lg \lg n)}
 
 bits.
This is a much more efficient encoding than representing n directly in binary, which takes 
 
 
 
 N
 =
 O
 (
 lg
 &#x2061;
 n
 )
 
 
 {\displaystyle N=O(\lg n)}
 
 bits. An established result in lossless data compression states that one cannot generally compress N bits of information into fewer than N bits. The representation above violates this by far when n is large enough since ⁠
 
 
 
 
 1
 
 
 
 {\displaystyle {1}}
 
⁠. Therefore, the number of primes must not be finite.[17]

### Proof using an even–odd argument

[edit]

Romeo Meštrović used an even-odd argument to show that if the number of primes is not infinite then 3 is the largest prime, a contradiction.[18]

Suppose that 
 
 
 
 
 p
 
 1
 
 
 =
 2
 <
 
 p
 
 2
 
 
 =
 3
 <
 
 p
 
 3
 
 
 <
 &#x22EF;
 <
 
 p
 
 k
 
 
 
 
 {\displaystyle p_{1}=2<p_{2}=3<p_{3}<\cdots <p_{k}}
 
 are all the prime numbers. Consider 
 
 
 
 P
 =
 3
 
 p
 
 3
 
 
 
 p
 
 4
 
 
 &#x22EF;
 
 p
 
 k
 
 
 
 
 {\displaystyle P=3p_{3}p_{4}\cdots p_{k}}
 
 and note that by assumption all positive integers relatively prime to it are in the set ⁠
 
 
 
 S
 =
 {
 1
 ,
 2
 ,
 
 2
 
 2
 
 
 ,
 
 2
 
 3
 
 
 ,
 &#x2026;
 }
 
 
 {\displaystyle S=\{1,2,2^{2},2^{3},\dots \}}
 
⁠. In particular, 
 
 
 
 2
 
 
 {\displaystyle 2}
 
 is relatively prime to 
 
 
 
 P
 
 
 {\displaystyle P}
 
 and so is ⁠
 
 
 
 P
 &#x2212;
 2
 
 
 {\displaystyle P-2}
 
⁠. However, this means that 
 
 
 
 P
 &#x2212;
 2
 
 
 {\displaystyle P-2}
 
 is an odd number in the set ⁠
 
 
 
 S
 
 
 {\displaystyle S}
 
⁠, so ⁠
 
 
 
 P
 &#x2212;
 2
 =
 1
 
 
 {\displaystyle P-2=1}
 
⁠, or ⁠
 
 
 
 P
 =
 3
 
 
 {\displaystyle P=3}
 
⁠. This means that 
 
 
 
 3
 
 
 {\displaystyle 3}
 
 must be the largest prime number which is a contradiction.

The above proof continues to work if 
 
 
 
 2
 
 
 {\displaystyle 2}
 
 is replaced by any prime 
 
 
 
 
 p
 
 j
 
 
 
 
 {\displaystyle p_{j}}
 
 with ⁠
 
 
 
 j
 &#x2208;
 {
 1
 ,
 2
 ,
 &#x2026;
 ,
 k
 &#x2212;
 1
 }
 
 
 {\displaystyle j\in \{1,2,\dots ,k-1\}}
 
⁠, the product 
 
 
 
 P
 
 
 {\displaystyle P}
 
 becomes 
 
 
 
 
 p
 
 1
 
 
 
 p
 
 2
 
 
 &#x22EF;
 
 p
 
 j
 &#x2212;
 1
 
 
 &#x22C5;
 
 p
 
 j
 +
 1
 
 
 &#x22EF;
 
 p
 
 k
 
 
 
 
 {\displaystyle p_{1}p_{2}\cdots p_{j-1}\cdot p_{j+1}\cdots p_{k}}
 
 and even vs. odd argument is replaced with a divisible vs. not divisible by 
 
 
 
 
 p
 
 j
 
 
 
 
 {\displaystyle p_{j}}
 
 argument. The resulting contradiction is that 
 
 
 
 P
 &#x2212;
 
 p
 
 j
 
 
 
 
 {\displaystyle P-p_{j}}
 
 must, simultaneously, equal 
 
 
 
 1
 
 
 {\displaystyle 1}
 
 and be greater than ⁠
 
 
 
 1
 
 
 {\displaystyle 1}
 
⁠,[a] which is impossible.

## Stronger results

[edit]

The theorems in this section simultaneously imply Euclid's theorem and other results.

### Dirichlet's theorem on arithmetic progressions

[edit]

- Main article: Dirichlet's theorem on arithmetic progressions

Dirichlet's theorem states that for any two positive coprime integers a and d, there are infinitely many primes of the form a + nd, where n is also a positive integer. In other words, there are infinitely many primes that are congruent to a modulo d.

### Prime number theorem

[edit]

- Main article: Prime number theorem

Let π(x) be the prime-counting function that gives the number of primes less than or equal to x, for any real number x. The prime number theorem then states that x / log x is a good approximation to π(x), in the sense that the limit of the quotient of the two functions π(x) and x / log x as x increases without bound is 1:

 
 
 
 
 lim
 
 x
 &#x2192;
 &#x221E;
 
 
 
 
 
 &#x03C0;
 (
 x
 )
 
 
 x
 
 /
 
 log
 &#x2061;
 (
 x
 )
 
 
 
 =
 1.
 
 
 {\displaystyle \lim _{x\rightarrow \infty }{\frac {\pi (x)}{x/\log(x)}}=1.}
 

Using asymptotic notation this result can be restated as

 
 
 
 &#x03C0;
 (
 x
 )
 &#x223C;
 
 
 x
 
 log
 &#x2061;
 x
 
 
 
 .
 
 
 {\displaystyle \pi (x)\sim {\frac {x}{\log x}}.}
 

This yields Euclid's theorem, since 
 
 
 
 
 lim
 
 x
 &#x2192;
 &#x221E;
 
 
 
 
 x
 
 log
 &#x2061;
 x
 
 
 
 =
 &#x221E;
 .
 
 
 {\displaystyle \lim _{x\rightarrow \infty }{\frac {x}{\log x}}=\infty .}
 

### Bertrand–Chebyshev theorem

[edit]

In number theory, Bertrand's postulate is a theorem stating that for any integer ⁠
 
 
 
 n
 >
 1
 
 
 {\displaystyle n>1}
 
⁠, there always exists at least one prime number such that

 
 
 
 n
 <
 p
 <
 2
 n
 .
 
 
 {\displaystyle n<p<2n.}
 

Equivalently, writing 
 
 
 
 &#x03C0;
 (
 x
 )
 
 
 {\displaystyle \pi (x)}
 
 for the prime-counting function (the number of primes less than or equal to ⁠
 
 
 
 x
 
 
 {\displaystyle x}
 
⁠), the theorem asserts that 
 
 
 
 &#x03C0;
 (
 x
 )
 &#x2212;
 &#x03C0;
 (
 
 
 
 x
 2
 
 
 
 )
 &#x2265;
 1
 
 
 {\textstyle \pi (x)-\pi ({\tfrac {x}{2}})\geq 1}
 
 for all ⁠
 
 
 
 x
 &#x2265;
 2
 
 
 {\displaystyle x\geq 2}
 
⁠.

This statement was first conjectured in 1845 by Joseph Bertrand[19] (1822–1900). Bertrand himself verified his statement for all numbers in the interval [2, 3 × 106].
His conjecture was completely proved by Chebyshev (1821–1894) in 1852[20] and so the postulate is also called the Bertrand–Chebyshev theorem or Chebyshev's theorem.

## Notes

[edit]

- ^ In the proof above (with ⁠
 
 
 
 j
 =
 1
 ,
 
 p
 
 j
 
 
 =
 2
 
 
 {\displaystyle j=1,p_{j}=2}
 
⁠), this contradiction would look as follows: ⁠
 
 
 
 1
 =
 P
 &#x2212;
 2
 >
 3
 
 p
 
 k
 
 
 &#x2212;
 2
 >
 2
 >
 1
 
 
 {\displaystyle 1=P-2>3p_{k}-2>2>1}
 
⁠. In the more general proof, the contradiction would be: ⁠
 
 
 
 1
 =
 P
 &#x2212;
 
 p
 
 j
 
 
 >
 2
 
 p
 
 k
 
 
 &#x2212;
 
 p
 
 j
 
 
 >
 
 p
 
 j
 
 
 >
 1
 
 
 {\displaystyle 1=P-p_{j}>2p_{k}-p_{j}>p_{j}>1}
 
⁠; that is, 
 
 
 
 
 p
 
 j
 
 
 
 
 {\displaystyle p_{j}}
 
 replaces 
 
 
 
 2
 
 
 {\displaystyle 2}
 
 and the coefficient of 
 
 
 
 
 p
 
 k
 
 
 
 
 {\displaystyle p_{k}}
 
 is the smallest prime in ⁠
 
 
 
 P
 
 
 {\displaystyle P}
 
⁠.

## References

[edit]

- 

- ^ Meštrović, Romeo (2023-07-25). "Euclid's theorem on the infinitude of primes: a historical survey of its proofs (300 B.C.--2022) and another new proof". arXiv:1202.3670 [math.HO].

- ^ James Williamson (translator and commentator), The Elements of Euclid, With Dissertations, Clarendon Press, Oxford, 1782, page 63.

- ^ 
- Ore, Oystein (1988) [1948], Number Theory and its History, Dover, p. 65

- ^ In general, for any integers a, b, c if 
 
 
 
 a
 &#x2223;
 b
 
 
 {\displaystyle a\mid b}
 
 and ⁠
 
 
 
 a
 &#x2223;
 c
 
 
 {\displaystyle a\mid c}
 
⁠, then ⁠
 
 
 
 a
 &#x2223;
 (
 b
 &#x2212;
 c
 )
 
 
 {\displaystyle a\mid (b-c)}
 
⁠. For more information, see Divisibility.

- ^ The exact formulation of Euclid's assertion is: "The prime numbers are more numerous than any proposed multitude of prime numbers".

- ^ 
- Katz, Victor J. (1998), A History of Mathematics – an Introduction (2nd ed.), Addison Wesley Longman, p. 87

- ^ Michael Hardy and Catherine Woodgold, "Prime Simplicity", Mathematical Intelligencer, volume 31, number 4, fall 2009, pages 44–52.

- ^ 
- Franzén, Torkel (2004), Inexhaustibility: A Non-exhaustive Treatment, A K Peters, Ltd, p. 101

- ^ 
- Bostock, Linda; Chandler, Suzanne; Rourke, C. (2014-11-01). Further Pure Mathematics. Nelson Thornes. p. 168. ISBN 9780859501033.

- ^ Theorems 7 and their Corollaries 1 and 2 in: Leonhard Euler. "Variae observationes circa series infinitas". Commentarii Academiae scientiarum imperialis Petropolitanae 9, 1744, pp. 160–188. English translation

- ^ In his History of the Theory of Numbers (Vol. 1, p. 413) Dickson refers to this proof, as well as to another one by citing page 235 of another work by Euler: Introductio in Analysin Infinitorum. Tomus Primus. Bousquet, Lausanne 1748. [1]. There (§ 279) Euler in fact essentially restates the much stronger Theorem 19 (described below) in the paper of his former proof.

- ^ 
- Havil, Julian (2003). Gamma: Exploring Euler's Constant. Princeton University Press. pp. 28–29. ISBN 0-691-09983-9.

- ^ 

- Furstenberg, Harry (1955). "On the infinitude of primes". American Mathematical Monthly. 62 (5): 353. doi:10.2307/2307043. JSTOR 2307043. MR 0068566.

- ^ Juan Pablo Pinasco, "New Proofs of Euclid's and Euler's theorems", American Mathematical Monthly, volume 116, number 2, February, 2009, pages 172–173.

- ^ Junho Peter Whang, "Another Proof of the Infinitude of the Prime Numbers", American Mathematical Monthly, volume 117, number 2, February 2010, page 181.

- ^ 
- Saidak, Filip (December 2006). "A New Proof of Euclid's Theorem". American Mathematical Monthly. 113 (10): 937–938. doi:10.2307/27642094. JSTOR 27642094.

- ^ 
- Shen, Alexander (2016), Kolmogorov complexity and algorithmic randomness (PDF), AMS, p. 245

- ^ 
- Meštrović, Romeo (13 December 2017). "A Very Short Proof of the Infinitude of Primes". The American Mathematical Monthly. 124 (6): 562. doi:10.4169/amer.math.monthly.124.6.562. Retrieved 30 June 2024.

- ^ 
- Bertrand, Joseph (1845), "Mémoire sur le nombre de valeurs que peut prendre une fonction quand on y permute les lettres qu'elle renferme.", Journal de l'École Royale Polytechnique (in French), 18 (Cahier 30): 123–140.

- ^ 
- Tchebychev, P. (1852), "Mémoire sur les nombres premiers." (PDF), Journal de mathématiques pures et appliquées, Série 1 (in French): 366–390. (Proof of the postulate: 371–382). Also see Mémoires de l'Académie Impériale des Sciences de St. Pétersbourg, vol. 7, pp. 15–33, 1854

## External links

[edit]

- 
- Weisstein, Eric W. "Euclid's Theorem". MathWorld.

- Euclid's Elements, Book IX, Prop. 20 (Euclid's proof, on David Joyce's website at Clark University)

- 
- v
- t
- e

Ancient Greek mathematics

Mathematicians
(timeline)

- Anaxagoras

- Anthemius

- Apollonius

- Archimedes

- Archytas

- Aristaeus the Elder

- Aristarchus

- Autolycus

- Bion

- Bryson

- Callippus

- Carpus

- Chrysippus

- Cleomedes

- Conon

- Ctesibius

- Democritus

- Dicaearchus

- Dinostratus

- Diocles

- Dionysodorus of Caunus

- Dionysodorus of Amisene

- Diophantus

- Domninus

- Eratosthenes

- Euclid

- Eudemus

- Eudoxus

- Eutocius

- Geminus

- Heliodorus

- Heron

- Hipparchus

- Hippasus

- Hippias

- Hippocrates

- Hypatia

- Hypsicles

- Isidore of Miletus

- Leon

- Marinus

- Menaechmus

- Menelaus

- Metrodorus

- Nicomachus

- Nicomedes

- Nicoteles

- Oenopides

- Pandrosion

- Pappus

- Perseus

- Philolaus

- Philon

- Philonides

- Porphyry of Tyre

- Posidonius

- Proclus

- Ptolemy

- Pythagoras

- Serenus

- Sosigenes

- Sporus

- Thales

- Theaetetus

- Theodorus

- Theodosius

- Theon of Alexandria

- Theon of Smyrna

- Thymaridas

- Xenocrates

- Zeno of Elea

- Zeno of Sidon

- Zenodorus

Treatises

- Almagest

- Arithmetica

- Conics (Apollonius)

- Catoptrics

- Data (Euclid)

- Elements (Euclid)

- Little Astronomy

- Measurement of a Circle

- On Conoids and Spheroids

- On the Sizes and Distances (Aristarchus)

- On Sizes and Distances (Hipparchus)

- On the Moving Sphere (Autolycus)

- Optics (Euclid)

- On Spirals

- On the Sphere and Cylinder

- Ostomachion

- Phaenomena (Euclid)

- Planisphaerium

- Spherics (Theodosius)

- Spherics (Menelaus)

- The Quadrature of the Parabola

- The Sand Reckoner

Concepts
and definitions

- Chord

- Circles of Apollonius

- Apollonian circles

- Apollonian gasket

- Problem of Apollonius

- Commensurability

- Diophantine equation

- Euclidean geometry

- Golden ratio

- Lune of Hippocrates

- Method of exhaustion

- Parallel postulate

- Platonic solid

- Regular polygon

- Straightedge and compass construction

- Angle trisection

- Doubling the cube

- Squaring the circle

- Quadratrix of Hippias

- Neusis construction

Results

In Elements

- Angle bisector theorem

- Exterior angle theorem

- Euclidean algorithm

- Euclid's theorem

- Geometric mean theorem

- Hinge theorem

- Inscribed angle theorem

- Intercept theorem

- Intersecting chords theorem

- Intersecting secants theorem

- Law of cosines

- Pons asinorum

- Pythagorean theorem

- Tangent-secant theorem

- Thales's theorem

- Theorem of the gnomon

- Apollonius's theorem

- Aristarchus's inequality

- Heron's formula

- Law of sines

- Menelaus's theorem

- Pappus's area theorem

- Problem II.8 of Arithmetica

- Ptolemy's inequality

- Ptolemy's table of chords

- Ptolemy's theorem

- Spiral of Theodorus

Centers/Schools

- Cyrene

- Platonic Academy

- Pythagoreanism

- School of Chios

Related

- Ancient Greek astronomy

- Attic numerals

- Greek numerals

History of

- A History of Greek Mathematics

- by Thomas Heath

- Archimedes Palimpsest

- algebra

- timeline

- arithmetic

- timeline

- calculus

- timeline

- geometry

- timeline

- logic

- timeline

- mathematics

- timeline

- numbers

- prehistoric counting

- numeral systems

- list

Other cultures

- Arabian/Islamic

- Babylonian

- Chinese

- Egyptian

- Inca

- Indian

- Japanese

 Ancient Greece portal • Mathematics portal

Retrieved from "https://en.wikipedia.org/w/index.php?title=Euclid%27s_theorem&oldid=1351844395"

 Categories: 
- Theorems about prime numbers
- Infinity

Hidden categories: 
- Articles containing Latin-language text
- CS1 French-language sources (fr)
- Articles with short description
- Short description is different from Wikidata
- Articles containing proofs

 

 
 
 

 
 

 

 

 

 

 
 
 
 

Search
 
 

 
 
 
 
 
 

 

 

 
 
 Euclid's theorem

 

 

 
 
 

 
 

 
 

 
 

 
 

 
 

 
 

 
 

 
 

32 languages
 
 

Add topic

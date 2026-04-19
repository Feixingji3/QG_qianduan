document.addEventListener('DOMContentLoaded', function () {
    const input = document.getElementById('search')
    const ul = document.querySelector('.result-list')
    input.addEventListener('focus', function () {
        ul.style.display = 'block'
    })
    const sliderDate = [
        { url: 'image/bc672fdb9463e1158f412cbfe3f83cf8.jpg' },
        { url: 'image/899019240ea6d519ca9e4577d38c1cf8.webp' },
        { url: 'image/6889d1e4e2526124f02ca29d9e642037.webp' },
        { url: 'image/45cc3e8bf79f46f9f43c6111c80dc315.webp' },
        { url: 'image/9e4c05da78b875be3cab3753dd15fdb6.webp' },
        { url: 'image/5277b329ce240b3eca69e2da4343bdc2.webp' },
    ]
    const banner = document.querySelector('.banner')
    const next = document.querySelector('.carousel-arrow.next')
    const prev = document.querySelector('.carousel-arrow.prev')
    const indicators = document.querySelectorAll('.under a')
    let i = 0

    function changeBanner(index) {
        banner.style.backgroundImage = `url('${sliderDate[index].url}')`
        indicators.forEach((item, idx) => {
            item.classList.remove('active')
            if (idx === index) {
                item.classList.add('active')
            }
        })
    }
    function autoPlay() {
        if (i >= sliderDate.length) {
            i = 0
        }
        changeBanner(i)
        i++
    }
    let timer = setInterval(autoPlay, 5000)

    next.addEventListener('click', function (e) {
        e.preventDefault()
        i++
        if (i >= sliderDate.length) {
            i = 0
        }
        changeBanner(i)
    })

    prev.addEventListener('click', function (e) {
        e.preventDefault()
        i--
        if (i < 0) {
            i = sliderDate.length - 1
        }
        changeBanner(i)
    })

    indicators.forEach((item, index) => {
        item.addEventListener('click', function (e) {
            e.preventDefault()
            i = index
            changeBanner(i)
        })
    })

    next.addEventListener('mouseenter', function () {
        clearInterval(timer)
    })
    next.addEventListener('mouseleave', autoPlay)

    prev.addEventListener('mouseenter', function () {
        clearInterval(timer)
    })
    prev.addEventListener('mouseleave', autoPlay)
})